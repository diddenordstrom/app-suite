import { and, eq } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import * as t from "../db/schema";
import * as repo from "../repo";
import { createCipher } from "@homelab/server-kit";
import { exchangeKey, GarminError } from "../providers/garmin";
import type { SyncRunner } from "../sync";
import { loadDemoData } from "../seed";
import { parseSettings } from "../../shared/types";
import { daysBetween, todayIn } from "../../shared/dates";
import { fitCriticalSpeed, fromThreeMinute, MAX_EFFORT_S, MIN_EFFORT_S, type CriticalSpeed, type Effort } from "../../shared/criticalspeed";
import { body, date, idParam, num, oneOf, optNum, router, BadRequest } from "./util";

export function settingsRoutes(db: Db, config: Config, syncer: SyncRunner) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  r.get("/settings", (c) => c.json(repo.getSettings(db, uid(c))));
  r.put("/settings", async (c) => {
    const s = parseSettings(await body(c));
    if (!s) throw new BadRequest("invalid settings");
    repo.saveSettings(db, uid(c), s);
    return c.json(s);
  });

  /** Guided tours (shared TourProvider): which ones this user has finished or closed. */
  const toursSeen = (userId: number) => {
    const row = db.select({ v: t.userSettings.toursSeen }).from(t.userSettings).where(eq(t.userSettings.userId, userId)).get();
    return row?.v ? row.v.split(",") : [];
  };
  r.get("/tours", (c) => c.json({ seen: toursSeen(uid(c)) }));
  r.put("/tours/:id", (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new BadRequest("invalid tour id");
    const seen = [...new Set([...toursSeen(uid(c)), id])].slice(-50).join(",");
    db.insert(t.userSettings).values({ userId: uid(c), toursSeen: seen })
      .onConflictDoUpdate({ target: t.userSettings.userId, set: { toursSeen: seen } }).run();
    return c.json({ seen: seen.split(",") });
  });
  r.delete("/tours", (c) => {
    // "Show the tour again" replays tours; release notes already read stay read.
    const kept = toursSeen(uid(c)).filter((id) => id.startsWith("news-"));
    db.update(t.userSettings).set({ toursSeen: kept.join(",") }).where(eq(t.userSettings.userId, uid(c))).run();
    return c.json({ seen: kept });
  });

  r.get("/thresholds", (c) => c.json(repo.listThresholds(db, uid(c))));
  r.post("/thresholds", async (c) => {
    const b = await body(c);
    const effectiveDate = date(b.effectiveDate, "effectiveDate");
    const paceSecPerKm = optNum(b.paceSecPerKm, "pace", 120, 900);
    const hr = optNum(b.hr, "hr", 100, 230);
    if (paceSecPerKm == null && hr == null) throw new BadRequest("pace or heart rate is required");
    const vals = { paceSecPerKm, hr: hr == null ? null : Math.round(hr) };
    db.insert(t.thresholds).values({ userId: uid(c), effectiveDate, ...vals })
      .onConflictDoUpdate({ target: [t.thresholds.userId, t.thresholds.effectiveDate], set: vals }).run();
    return c.json(repo.listThresholds(db, uid(c)));
  });
  r.delete("/thresholds/:id", (c) => {
    db.delete(t.thresholds).where(and(eq(t.thresholds.userId, uid(c)), eq(t.thresholds.id, idParam(c.req.param("id"))))).run();
    return c.json(repo.listThresholds(db, uid(c)));
  });

  r.get("/cs-tests", (c) => c.json(repo.listCsTests(db, uid(c))));
  /** Maximal efforts (kind "trials": efforts[] of distanceM + durationS) or the 3-minute test (kind "three_min": totalM + last30M). */
  r.post("/cs-tests", async (c) => {
    const b = await body(c);
    const testDate = date(b.date);
    const kind = oneOf(b.kind, ["trials", "three_min"] as const, "kind");
    let inputs: unknown;
    let cs: CriticalSpeed | null;
    if (kind === "trials") {
      if (!Array.isArray(b.efforts) || b.efforts.length < 2 || b.efforts.length > 5) throw new BadRequest("efforts must list 2 to 5 maximal efforts");
      const efforts: Effort[] = b.efforts.map((e: Record<string, unknown>, i: number) => ({
        distanceM: num(e?.distanceM, `effort ${i + 1} distance`, 200, 15000),
        durationS: num(e?.durationS, `effort ${i + 1} time`, MIN_EFFORT_S, MAX_EFFORT_S),
      }));
      inputs = efforts;
      cs = fitCriticalSpeed(efforts);
    } else {
      const totalM = num(b.totalM, "total distance", 200, 1500);
      const last30M = num(b.last30M, "last 30 s distance", 30, 300);
      inputs = { totalM, last30M };
      cs = fromThreeMinute(totalM, last30M);
    }
    if (!cs) throw new BadRequest("Those results don't give a sensible critical speed. Efforts should be maximal and at least a minute apart in length (3–12 minutes is best), and the longer one can't be slower per metre than the shorter.");
    db.insert(t.csTests).values({ userId: uid(c), date: testDate, kind, inputs: JSON.stringify(inputs), csMps: cs.csMps, dPrimeM: cs.dPrimeM }).run();
    return c.json(repo.listCsTests(db, uid(c)));
  });
  r.delete("/cs-tests/:id", (c) => {
    db.delete(t.csTests).where(and(eq(t.csTests.userId, uid(c)), eq(t.csTests.id, idParam(c.req.param("id"))))).run();
    return c.json(repo.listCsTests(db, uid(c)));
  });

  const garminStatus = (userId: number) => {
    const a = db.select().from(t.garminAccounts).where(eq(t.garminAccounts.userId, userId)).get();
    if (!a) return { connected: false as const };
    const today = todayIn(repo.getSettings(db, userId).timezone);
    const daysLeft = a.keyExpiresOn ? daysBetween(today, a.keyExpiresOn) : null;
    return { connected: true as const, keyExpiresOn: a.keyExpiresOn, daysLeft, lastSyncAt: a.lastSyncAt, lastError: a.lastError, connectedAt: a.connectedAt,
      syncing: syncer.isSyncing(userId), autoSyncDue: syncer.autoDue(userId) };
  };

  r.get("/garmin", (c) => c.json(garminStatus(uid(c))));
  r.put("/garmin", async (c) => {
    // Demo visitors never get to send keys anywhere or store them.
    if (config.authMode === "demo") return c.json({ error: "Not available in the demo" }, 403);
    const b = await body(c);
    const apiKey = typeof b.apiKey === "string" ? b.apiKey.trim() : "";
    if (apiKey.length < 8 || apiKey.length > 4096) throw new BadRequest("Paste the full API key");
    const keyExpiresOn = b.keyExpiresOn ? date(b.keyExpiresOn, "keyExpiresOn") : null;
    let token;
    try {
      token = await exchangeKey(config.garminBaseUrl, apiKey);
    } catch (e) {
      throw new BadRequest(e instanceof GarminError ? e.message : `Could not reach Garmin: ${(e as Error).message}`);
    }
    const cipher = createCipher(config.masterKey);
    const vals = { keyEnc: cipher.encrypt(apiKey), keyExpiresOn, tokenEnc: cipher.encrypt(token.token), tokenExp: token.exp, connectedAt: Date.now(), lastError: null };
    db.insert(t.garminAccounts).values({ userId: uid(c), ...vals }).onConflictDoUpdate({ target: t.garminAccounts.userId, set: vals }).run();
    return c.json(garminStatus(uid(c)));
  });
  r.delete("/garmin", (c) => {
    db.delete(t.garminAccounts).where(eq(t.garminAccounts.userId, uid(c))).run();
    return c.json(garminStatus(uid(c)));
  });

  /**
   * `?auto=1` is the visit-triggered sync: it only runs when the last sync is over an hour old,
   * otherwise it answers `{ skipped: true }`. Either way a sync already running is joined, not doubled.
   */
  r.post("/sync", async (c) => {
    const userId = uid(c);
    const auto = c.req.query("auto") === "1";
    if (auto && !syncer.isSyncing(userId) && !syncer.autoDue(userId)) return c.json({ skipped: true });
    const running = syncer.run(userId);
    if (!running) throw new BadRequest("Connect Garmin in Settings first");
    const out = await running;
    return out.ok ? c.json(out.result) : c.json({ error: out.error }, 502);
  });

  /** Fill the account with generated training, a plan and races so the app can be tried without Garmin. */
  r.post("/demo", async (c) => {
    return c.json(await loadDemoData(db, uid(c)));
  });

  r.delete("/data", (c) => {
    repo.deleteTrainingData(db, uid(c));
    return c.json({ ok: true });
  });

  return r;
}
