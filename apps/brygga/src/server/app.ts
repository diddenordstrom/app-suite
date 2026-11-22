import { Hono } from "hono";

/** Brygga keeps everything in the browser: the server only answers a health check; index.ts adds the built client. */
export function createApp() {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  return app;
}
