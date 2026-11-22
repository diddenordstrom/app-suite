import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Context, Hono, Next } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

/**
 * Demo mode for any app (docs/decisions/demo-mode.md): GET /demo gives the visitor their own SQLite file in the
 * demo folder, filled with demo data, and a signed cookie naming it. /api requests carrying that cookie are served
 * by an app instance on that file, where the visitor is a fixed demo user; without the cookie they fall through
 * to the real app. Nothing a visitor does can reach the real database or another visitor's data.
 *
 * Disk is bounded by the account cap: a demo is one file, deleted after `idleMs` without requests (tracked with
 * the file's mtime, so it survives restarts) or when the visitor ends it.
 */

export const DEMO_COOKIE = "demo_sid";
export const DEMO_DEFAULTS = { maxAccounts: 100, idleMs: 2 * 3600_000, perIp: { max: 5, windowMs: 3600_000 }, keepOpen: 20 };

/** An app running on one demo database file. */
export interface DemoInstance {
  fetch(req: Request): Response | Promise<Response>;
  close(): void;
}

export interface DemoOptions {
  /** Folder for the demo files; must not hold anything else. */
  dir: string;
  /** Open the app on a demo database file. `fresh` is true right after /demo created it: fill it with demo data. */
  open(file: string, fresh: boolean): DemoInstance | Promise<DemoInstance>;
  /** Signs the cookie; use the app's session secret. */
  secret: string;
  /** Secure cookie (production). */
  secure: boolean;
  /** At most this many demos at once. */
  maxAccounts?: number;
  /** A demo is deleted this long after its last request. */
  idleMs?: number;
  /** New demos per client IP. */
  perIp?: { max: number; windowMs: number };
  /** Open database connections kept around; idle ones beyond this are closed (the file stays). */
  keepOpen?: number;
  now?: () => number;
}

/** At most `max` hits per key within the last `windowMs`. In memory, so it resets on restart. */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    hit(key: string, now: number): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => t <= now - windowMs)) hits.delete(k);
      return true;
    },
  };
}

/** The visitor's IP. Behind the Cloudflare tunnel, cf-connecting-ip is set by Cloudflare and can't be spoofed. */
export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Demo settings from the environment: off in production unless DEMO_ENABLED=true; files in demo/ next to the real database. */
export function demoConfig(env: NodeJS.ProcessEnv, databasePath: string, production: boolean) {
  const dir = path.resolve(env.DEMO_DIR ?? path.join(path.dirname(databasePath), "demo"));
  const enabled = env.DEMO_ENABLED === undefined ? !production : env.DEMO_ENABLED === "true";
  if (enabled && path.resolve(databasePath).startsWith(dir + path.sep)) throw new Error("DEMO_DIR must not contain the real database");
  return { enabled, dir };
}

const SID = /^[0-9a-f]{64}$/;
const SUFFIXES = ["", "-wal", "-shm", "-journal"];

export function createDemo(opts: DemoOptions) {
  const maxAccounts = opts.maxAccounts ?? DEMO_DEFAULTS.maxAccounts;
  const idleMs = opts.idleMs ?? DEMO_DEFAULTS.idleMs;
  const keepOpen = opts.keepOpen ?? DEMO_DEFAULTS.keepOpen;
  const limiter = createRateLimiter(opts.perIp ?? DEMO_DEFAULTS.perIp);
  const now = opts.now ?? Date.now;
  const open = new Map<string, { inst: DemoInstance; used: number; touched: number }>();
  let starting = 0;
  fs.mkdirSync(opts.dir, { recursive: true });

  const fileOf = (sid: string) => path.join(opts.dir, `${sid}.db`);
  const sids = () => fs.readdirSync(opts.dir).filter((f) => f.endsWith(".db")).map((f) => f.slice(0, -3)).filter((s) => SID.test(s));

  function close(sid: string) {
    const o = open.get(sid);
    if (!o) return;
    open.delete(sid);
    try { o.inst.close(); } catch { /* already closed */ }
  }

  function remove(sid: string) {
    close(sid);
    for (const s of SUFFIXES) fs.rmSync(fileOf(sid) + s, { force: true });
  }

  /** Close the least recently used connections beyond `keepOpen`. */
  function trim() {
    if (open.size <= keepOpen) return;
    const byAge = [...open.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [sid] of byAge.slice(0, open.size - keepOpen)) close(sid);
  }

  async function instance(sid: string, fresh: boolean): Promise<DemoInstance> {
    const o = open.get(sid);
    const t = now();
    if (o) {
      o.used = t;
      // Mark activity on disk at most once a minute; the sweep reads it.
      if (t - o.touched > 60_000) { fs.utimesSync(fileOf(sid), t / 1000, t / 1000); o.touched = t; }
      return o.inst;
    }
    const inst = await opts.open(fileOf(sid), fresh);
    open.set(sid, { inst, used: t, touched: t });
    fs.utimesSync(fileOf(sid), t / 1000, t / 1000);
    trim();
    return inst;
  }

  /** Delete every demo idle for longer than `idleMs`. Returns how many went. */
  function sweep(t = now()): number {
    let gone = 0;
    for (const sid of sids()) {
      const st = fs.statSync(fileOf(sid), { throwIfNoEntry: false });
      const last = Math.max(st?.mtimeMs ?? 0, open.get(sid)?.used ?? 0);
      if (last <= t - idleMs) { remove(sid); gone++; }
    }
    // Leftovers from a crash: WAL files without their database.
    for (const f of fs.readdirSync(opts.dir)) {
      const base = f.replace(/-(wal|shm|journal)$/, "");
      if (base !== f && !fs.existsSync(path.join(opts.dir, base))) fs.rmSync(path.join(opts.dir, f), { force: true });
    }
    return gone;
  }

  const count = () => sids().length;
  const sidFrom = async (c: Context) => {
    const sid = await getSignedCookie(c, opts.secret, DEMO_COOKIE);
    return sid && SID.test(sid) && fs.existsSync(fileOf(sid)) ? sid : null;
  };

  async function start(c: Context) {
    const t = now();
    sweep(t);
    if (count() + starting >= maxAccounts) return c.redirect("/?demo=full");
    if (!limiter.hit(clientIp(c), t)) return c.redirect("/?demo=limited");
    const sid = crypto.randomBytes(32).toString("hex");
    starting++;
    try {
      await instance(sid, true);
    } catch (e) {
      console.error("demo start failed:", e);
      remove(sid);
      return c.redirect("/?demo=error");
    } finally {
      starting--;
    }
    await setSignedCookie(c, DEMO_COOKIE, sid, opts.secret, { httpOnly: true, sameSite: "Lax", secure: opts.secure, path: "/" });
    return c.redirect("/");
  }

  /** /api middleware: demo requests go to the visitor's instance; ending the demo and signing in are handled here. */
  async function handle(c: Context, next: Next) {
    if (!c.req.header("cookie")?.includes(`${DEMO_COOKIE}=`)) return next();
    const sid = await sidFrom(c);
    const p = c.req.path;
    if (!sid || (p === "/api/auth/login" && c.req.method === "GET")) {
      // Expired, unknown, or leaving the demo to sign in for real: drop the cookie and carry on to the real app.
      deleteCookie(c, DEMO_COOKIE, { path: "/" });
      return sid ? c.redirect("/api/auth/login") : next();
    }
    if (p === "/api/auth/logout" && c.req.method === "POST") {
      if (c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "forbidden" }, 403);
      remove(sid);
      deleteCookie(c, DEMO_COOKIE, { path: "/" });
      return c.json({ ok: true });
    }
    return (await instance(sid, false)).fetch(c.req.raw);
  }

  return {
    idleMs,
    count,
    sweep,
    /** Add GET /demo and the /api routing to the app. Call before the real routes are added. */
    mount(app: Hono) {
      app.get("/demo", start);
      app.use("/api/*", handle);
      return this;
    },
    /** Delete idle demos every `intervalMs` (default 10 min). */
    startSweeper(intervalMs = 10 * 60_000) {
      const timer = setInterval(() => {
        try {
          const n = sweep();
          if (n) console.log(`demo: removed ${n} idle demo(s)`);
        } catch (e) {
          console.error("demo sweep failed:", e);
        }
      }, intervalMs);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}

export type Demo = ReturnType<typeof createDemo>;
