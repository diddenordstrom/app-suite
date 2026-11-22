import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { generateVAPIDKeys, sendNotification } from "web-push";
import type { AuthEnv } from "./auth";
import type { Cipher } from "./crypto";

/*
 * Web Push for every app (docs/decisions/web-push.md): the VAPID keys, each device's subscription and
 * sending. What to send and when stays in the app; this only gets a payload to the user's devices.
 * iOS needs the PWA added to the home screen (16.4+) and the permission asked from a tap.
 */

/** The app's tables, spread into its schema like `authTables()`, so drizzle-kit writes the migration. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pushTables(users: any) {
  const pushSubscriptions = sqliteTable("push_subscriptions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** The language the device had when it subscribed: the message is written in it. */
    lang: text("lang").notNull().default("sv"),
    createdAt: integer("created_at").notNull(),
  }, (tb) => [uniqueIndex("push_subscriptions_endpoint").on(tb.endpoint)]);
  /** One row: the server's VAPID key pair, made on first use so a deploy needs no new secret. */
  const pushKeys = sqliteTable("push_keys", {
    id: integer("id").primaryKey(),
    publicKey: text("public_key").notNull(),
    privateKey: text("private_key").notNull(),
  });
  return { pushSubscriptions, pushKeys };
}
type Tables = ReturnType<typeof pushTables>;

export type PushLang = "sv" | "en";
export interface PushMessage { title: string; body: string; /** Opened on tap; defaults to "/". */ url?: string; /** Same tag replaces an earlier notification. */ tag?: string }
export interface PushConfig { publicUrl: string; authMode: string; env?: NodeJS.ProcessEnv }
export interface PushResult { sent: number; removed: number; failed: number }

const TEST: Record<PushLang, PushMessage> = {
  sv: { title: "Notiser är på", body: "Så här ser det ut när appen säger till.", tag: "push-test" },
  en: { title: "Notifications are on", body: "This is how it looks when the app lets you know.", tag: "push-test" },
};
const langOf = (v: unknown): PushLang => (v === "en" ? "en" : "sv");

/**
 * Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set, else from the database (made once).
 * The subject is VAPID_SUBJECT or the app's public URL; Apple refuses a localhost subject, so dev
 * falls back to a mailto.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPush(db: BetterSQLite3Database<any>, config: PushConfig, { pushSubscriptions: subs, pushKeys }: Tables,
  deps: { send?: typeof sendNotification; /** Keeps the private key encrypted at rest (an app's master key). */ cipher?: Cipher } = {}) {
  const env = config.env ?? process.env;
  const send = deps.send ?? sendNotification;
  let keys: { publicKey: string; privateKey: string } | null = null;

  function vapid() {
    if (keys) return keys;
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return (keys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
    const row = db.select().from(pushKeys).where(eq(pushKeys.id, 1)).get();
    const open = (r: { publicKey: string; privateKey: string }) => ({ publicKey: r.publicKey, privateKey: deps.cipher ? deps.cipher.decrypt(r.privateKey) : r.privateKey });
    if (row) return (keys = open(row));
    const made = generateVAPIDKeys();
    db.insert(pushKeys).values({ id: 1, publicKey: made.publicKey, privateKey: deps.cipher ? deps.cipher.encrypt(made.privateKey) : made.privateKey }).onConflictDoNothing().run();
    return (keys = open(db.select().from(pushKeys).where(eq(pushKeys.id, 1)).get()!));
  }
  const subject = () => env.VAPID_SUBJECT || (/^https:\/\//.test(config.publicUrl) && !/localhost/.test(config.publicUrl) ? config.publicUrl : "mailto:push@example.com");

  const devices = (userId: number) => db.select().from(subs).where(eq(subs.userId, userId)).all();

  /** Send to every device the user has; gone subscriptions (404/410) are removed. `message` may depend on the device's language. */
  async function sendTo(userId: number, message: PushMessage | ((lang: PushLang) => PushMessage)): Promise<PushResult> {
    const k = vapid();
    const res: PushResult = { sent: 0, removed: 0, failed: 0 };
    for (const s of devices(userId)) {
      const m = typeof message === "function" ? message(langOf(s.lang)) : message;
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ url: "/", ...m }), {
          TTL: 6 * 3600, urgency: "normal", vapidDetails: { subject: subject(), publicKey: k.publicKey, privateKey: k.privateKey },
        });
        res.sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          db.delete(subs).where(eq(subs.id, s.id)).run();
          res.removed++;
        } else {
          console.warn(`push to user ${userId} failed: ${code ?? ""} ${(e as Error).message}`);
          res.failed++;
        }
      }
    }
    return res;
  }

  /** Users with at least one device. */
  function subscribedUsers(): number[] {
    return [...new Set(db.select({ u: subs.userId }).from(subs).all().map((r) => r.u))];
  }

  /** Mounted under the signed-in API: `/push` (key + device count), subscribe, unsubscribe, test. */
  function routes() {
    const r = new Hono<AuthEnv>();
    const off = () => config.authMode === "demo";
    r.get("/push", (c) => {
      if (off()) return c.json({ enabled: false, publicKey: null, devices: 0 });
      const list = devices(c.get("user").id);
      return c.json({ enabled: true, publicKey: vapid().publicKey, devices: list.length, endpoints: list.map((s) => s.endpoint) });
    });
    r.post("/push/subscriptions", async (c) => {
      if (off()) return c.json({ error: "Not in demo mode" }, 403);
      const b = await c.req.json().catch(() => null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; lang?: unknown } | null;
      const endpoint = b?.endpoint, p256dh = b?.keys?.p256dh, auth = b?.keys?.auth;
      if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000
        || typeof p256dh !== "string" || p256dh.length > 200 || typeof auth !== "string" || auth.length > 100) {
        return c.json({ error: "invalid subscription" }, 400);
      }
      const userId = c.get("user").id;
      const vals = { userId, p256dh, auth, lang: langOf(b?.lang) };
      // An endpoint belongs to one browser: a new sign-in on the same device takes it over.
      db.insert(subs).values({ endpoint, createdAt: Date.now(), ...vals }).onConflictDoUpdate({ target: subs.endpoint, set: vals }).run();
      return c.json({ devices: devices(userId).length });
    });
    r.delete("/push/subscriptions", async (c) => {
      const b = await c.req.json().catch(() => null) as { endpoint?: unknown } | null;
      const userId = c.get("user").id;
      if (typeof b?.endpoint === "string") db.delete(subs).where(and(eq(subs.userId, userId), eq(subs.endpoint, b.endpoint))).run();
      else db.delete(subs).where(eq(subs.userId, userId)).run();
      return c.json({ devices: devices(userId).length });
    });
    r.post("/push/test", async (c) => {
      if (off()) return c.json({ error: "Not in demo mode" }, 403);
      return c.json(await sendTo(c.get("user").id, (lang) => TEST[lang]));
    });
    return r;
  }

  return { routes, sendTo, subscribedUsers, publicKey: () => vapid().publicKey };
}
export type Push = ReturnType<typeof createPush>;

/* ---------- Daily notifications at a time the user picks ---------- */

/** "HH:MM" (24 h) or null. */
export function parseTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
  return m ? v : null;
}

/** The local date and "HH:MM" in a time zone. */
export function localNow(now: Date, timeZone: string): { date: string; time: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    return localNow(now, "UTC");
  }
  const p = (t: string) => parts.find((x) => x.type === t)!.value;
  return { date: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
}

/** Minutes from `from` to `to`, both "HH:MM" on the same day. */
export const minutesBetween = (from: string, to: string) => {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return m(to) - m(from);
};

/**
 * Is a daily notification at `time` due now? From that time until the end of the local day, once a day
 * (`lastSentOn` is the local date it last went out). A server that was down at the time catches up later
 * the same day rather than not at all.
 */
export function dailyDue(now: Date, timeZone: string, time: string | null, lastSentOn: string | null): { due: boolean; date: string; lateMin: number } {
  const local = localNow(now, timeZone);
  if (!time) return { due: false, date: local.date, lateMin: 0 };
  const late = minutesBetween(time, local.time);
  return { due: late >= 0 && lastSentOn !== local.date, date: local.date, lateMin: late };
}

/** Run `tick` every `ms` (a minute by default), one at a time; errors are logged, not thrown. Returns a stop function. */
export function startTicker(tick: () => Promise<void> | void, ms = 60_000): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { console.warn(`push ticker: ${(e as Error).message}`); } finally { running = false; }
  };
  const h = setInterval(() => void run(), ms);
  h.unref?.();
  void run();
  return () => clearInterval(h);
}
