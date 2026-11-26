import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import type { Config } from "./config";
import type { Db } from "./db";
import { createAuth, createCipher, createPush, type AuthEnv } from "@homelab/server-kit";
import { pushKeys, pushSubscriptions, sessions, users } from "./db/schema";
import { settingsRoutes } from "./routes/settings";
import { planRoutes } from "./routes/plan";
import { blockRoutes } from "./routes/blocks";
import { nextWeekRoutes } from "./routes/nextweek";
import { blockPlanRoutes } from "./routes/blockplan";
import { activityRoutes } from "./routes/activities";
import { overviewRoutes } from "./routes/overview";
import { createSyncRunner } from "./sync";
import { intervalsRoutes } from "./routes/intervals";
import { templateRoutes } from "./routes/templates";
import { sameSessionRoutes } from "./routes/samesession";
import { tuningRoutes } from "./routes/tuning";
import { simRoutes } from "./routes/sim";
import { gymRoutes } from "./routes/gym";
import { statsRoutes } from "./routes/stats";
import { createIntervalsPusher, type IntervalsPusher } from "./intervals";
import { createMorning } from "./morning";

/** The long-lived pieces the routes share with the background jobs in index.ts (the morning notification). */
export function createServices(db: Db, config: Config, deps: { fetch?: typeof fetch; pusher?: IntervalsPusher } = {}) {
  const syncer = createSyncRunner(db, config);
  const push = createPush(db, config, { pushSubscriptions, pushKeys }, { cipher: createCipher(config.masterKey) });
  return { syncer, push, morning: createMorning(db, push, syncer), pusher: deps.pusher ?? createIntervalsPusher(db, config, deps.fetch) };
}
export type Services = ReturnType<typeof createServices>;

export function createApp(db: Db, config: Config, deps: { fetch?: typeof fetch; pusher?: IntervalsPusher; services?: Services } = {}) {
  const services = deps.services ?? createServices(db, config, deps);
  const { pusher, push, morning } = services;
  const app = new Hono();
  const api = new Hono<AuthEnv>();

  api.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Something went wrong" }, 500);
  });

  api.use("*", csrf({ origin: config.publicUrl }));
  api.get("/health", (c) => c.json({ ok: true }));
  const auth = createAuth(db, config, { users, sessions });
  api.route("/auth", auth.routes());

  // Everything below requires a logged-in user.
  const authed = new Hono<AuthEnv>();
  authed.use("*", auth.requireUser);
  // Any change may touch the plan; the intervals.icu push compares and only sends what changed.
  authed.use("*", async (c, next) => {
    await next();
    if (config.authMode === "demo" || c.req.path.startsWith("/api/intervals") || c.req.path.startsWith("/api/push")) return;
    const userId = c.get("user").id;
    if (c.req.method === "GET") pusher.refreshIfStale(userId);
    else if (c.res.ok) pusher.schedule(userId);
  });
  authed.route("/", settingsRoutes(db, config, services.syncer));
  authed.route("/", planRoutes(db));
  authed.route("/", blockRoutes(db));
  authed.route("/", nextWeekRoutes(db));
  authed.route("/", blockPlanRoutes(db));
  authed.route("/", activityRoutes(db, config));
  authed.route("/", overviewRoutes(db));
  authed.route("/", intervalsRoutes(db, config, pusher));
  authed.route("/", templateRoutes(db));
  authed.route("/", sameSessionRoutes(db));
  authed.route("/", tuningRoutes(db, auth.requireAdmin));
  authed.route("/", gymRoutes(db));
  authed.route("/", statsRoutes(db));
  authed.route("/", simRoutes());
  authed.route("/", push.routes());
  authed.route("/", morning.routes());
  api.route("/", authed);

  app.route("/api", api);
  return app;
}
