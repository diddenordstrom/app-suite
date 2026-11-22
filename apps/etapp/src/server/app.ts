import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import type { Config } from "./config";
import type { Db } from "./db";
import { createAuth } from "@homelab/server-kit";
import { sessions, users } from "./db/schema";
import { EventBus } from "./events";
import { ApiError } from "./http";
import { tripMiddleware, viewerMiddleware, type AppEnv } from "./viewer";
import { accountRoutes } from "./routes/account";
import { tripRoutes } from "./routes/trips";
import { eventRoutes } from "./routes/events";
import { planRoutes } from "./routes/plan";
import { photoRoutes } from "./routes/photos";
import { PhotoStore } from "./photos";

export function createApp(db: Db, config: Config, bus = new EventBus(), photos = new PhotoStore(config.uploadsDir)) {
  const app = new Hono();
  const api = new Hono<AppEnv>();

  api.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  api.use("*", csrf({ origin: config.publicUrl }));
  api.get("/health", (c) => c.json({ ok: true }));
  const auth = createAuth(db, config, { users, sessions });
  api.route("/auth", auth.routes());

  api.use("*", viewerMiddleware(db, config, auth));
  api.route("/", accountRoutes(db, config, bus));

  api.use("/t/:tid", tripMiddleware);
  api.use("/t/:tid/*", tripMiddleware);
  for (const sub of [tripRoutes(db, config, bus), planRoutes(db, bus, photos), photoRoutes(db, bus, photos), eventRoutes(bus)]) {
    api.route("/t/:tid", sub);
  }

  app.route("/api", api);
  return app;
}
