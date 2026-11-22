import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { dailyDue, parseTime, startTicker, type AuthEnv, type Push, type PushLang, type PushMessage } from "@homelab/server-kit";
import type { Db } from "./db";
import * as t from "./db/schema";
import * as repo from "./repo";
import { ctxFor, weekSummaries } from "./analysis";
import { readinessFor } from "./routes/overview";
import type { SyncRunner } from "./sync";
import { addDays } from "../shared/dates";
import { fmtDist, type Units } from "../shared/format";
import { hasLastNight, MORNING, morningParts, type MorningParts } from "../shared/morning";
import { lowFormPlan, missedSessions, todaySessions } from "../shared/today";

/*
 * The morning notification (docs/decisions/fartlek-morning-push.md). Each minute: for users with a time set and a
 * device subscribed, once the time has passed today, sync Garmin so last night is in, then send today's session and
 * form. Waits up to two hours for last night's HRV or sleep before sending without it.
 * The text lives here rather than in the client dictionaries, which read the language once in the browser.
 */

const TEXT = {
  sv: {
    title: "Idag: {sessions}", rest: "Vilodag", and: " + ",
    form: "Dagsform {score}/10, {verdict}", uncertain: " (osäker)", noForm: "Ingen dagsform än. Checka in i appen.",
    suggestion: " Det finns ett förslag i appen.",
    verdict: { fine: "kör på!", trim: "ta det lite lugnare", backOff: "dra ner", stop: "vila" },
    type: { easy: "lugnt", long: "långpass", threshold: "tröskel", intervals: "intervaller", race: "lopp", cross: "alternativträning", strength: "gym", rest: "vila" },
  },
  en: {
    title: "Today: {sessions}", rest: "Rest day", and: " + ",
    form: "Form {score}/10, {verdict}", uncertain: " (uncertain)", noForm: "No form score yet. Check in in the app.",
    suggestion: " There's a suggestion in the app.",
    verdict: { fine: "go for it!", trim: "take it a bit easier", backOff: "back off", stop: "rest" },
    type: { easy: "easy", long: "long run", threshold: "threshold", intervals: "intervals", race: "race", cross: "cross-train", strength: "gym", rest: "rest" },
  },
} as const;

export function morningText(p: MorningParts, lang: PushLang, units: Units): PushMessage {
  const d = TEXT[lang];
  const list = p.sessions.map((s) => [d.type[s.type], s.km ? fmtDist(s.km, units, s.km % 1 ? 1 : 0) : null].filter(Boolean).join(" ")).join(d.and);
  const title = list ? d.title.replace("{sessions}", list) : d.rest;
  const body = p.score == null ? d.noForm
    : d.form.replace("{score}", String(p.score)).replace("{verdict}", d.verdict[p.verdict]) + (p.uncertain ? d.uncertain : "") + (p.suggestion ? d.suggestion : "");
  return { title, body, url: "/", tag: "fartlek-morning" };
}

/** What would go out for this user right now. */
export function morningFor(db: Db, userId: number): { parts: MorningParts; units: Units; lastNight: boolean; today: string } {
  const ctx = ctxFor(db, userId);
  const week = weekSummaries(ctx, ctx.today, ctx.today).find((w) => w.weekStart <= ctx.today && addDays(w.weekStart, 6) >= ctx.today);
  const sessions = week?.sessions ?? [];
  const { readiness, wellness } = readinessFor(ctx);
  const weekEnd = week ? addDays(week.weekStart, 6) : ctx.today;
  const suggestion = !!lowFormPlan(readiness.verdict, sessions, ctx.today, weekEnd, ctx.settings.runDays) || missedSessions(sessions, ctx.today).length > 0;
  return { parts: morningParts(readiness, todaySessions(sessions, ctx.today), suggestion), units: ctx.settings.units, lastNight: hasLastNight(wellness, ctx.today), today: ctx.today };
}

const prefsOf = (db: Db, userId: number) => db.select().from(t.morningPush).where(eq(t.morningPush.userId, userId)).get();

export function createMorning(db: Db, push: Push, syncer: SyncRunner, now: () => Date = () => new Date()) {
  const lastTry = new Map<number, number>();
  const garmin = (userId: number) => !!db.select({ u: t.garminAccounts.userId }).from(t.garminAccounts).where(eq(t.garminAccounts.userId, userId)).get();

  async function tick() {
    for (const userId of push.subscribedUsers()) {
      const prefs = prefsOf(db, userId);
      if (!prefs?.time) continue;
      const due = dailyDue(now(), repo.getSettings(db, userId).timezone, prefs.time, prefs.sentOn);
      if (!due.due) continue;
      if (garmin(userId)) {
        // Wait for last night: ask Garmin at most every `retryMin`, until it's in or the wait is over.
        const at = lastTry.get(userId) ?? 0;
        if (now().getTime() - at >= MORNING.retryMin * 60_000) {
          lastTry.set(userId, now().getTime());
          await syncer.run(userId);
        }
        if (!morningFor(db, userId).lastNight && due.lateMin < MORNING.waitForNightMin) continue;
      }
      const m = morningFor(db, userId);
      db.update(t.morningPush).set({ sentOn: due.date }).where(eq(t.morningPush.userId, userId)).run();
      lastTry.delete(userId);
      await push.sendTo(userId, (lang) => morningText(m.parts, lang, m.units));
    }
  }

  function routes() {
    const r = new Hono<AuthEnv>();
    r.get("/push/morning", (c) => c.json({ time: prefsOf(db, c.get("user").id)?.time ?? null, defaultTime: MORNING.defaultTime }));
    r.put("/push/morning", async (c) => {
      const b = await c.req.json().catch(() => ({})) as { time?: unknown };
      const time = b.time === null ? null : parseTime(b.time);
      if (b.time !== null && !time) return c.json({ error: "time must be HH:MM" }, 400);
      const userId = c.get("user").id;
      // Setting a time later than now today still sends today; one already passed waits for tomorrow.
      const tz = repo.getSettings(db, userId).timezone;
      const d = dailyDue(now(), tz, time, null);
      const sentOn = d.due && d.lateMin > 0 ? d.date : null;
      db.insert(t.morningPush).values({ userId, time, sentOn }).onConflictDoUpdate({ target: t.morningPush.userId, set: { time, sentOn } }).run();
      return c.json({ time });
    });
    /** Today's notification, now, to every device: to see what it says. */
    r.post("/push/morning/test", async (c) => {
      const userId = c.get("user").id;
      const m = morningFor(db, userId);
      return c.json(await push.sendTo(userId, (lang) => morningText(m.parts, lang, m.units)));
    });
    return r;
  }

  return { tick, routes, start: () => startTicker(tick) };
}
