import fs from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createDemo, serveClient } from "@homelab/server-kit";
import { createApp, createServices } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { openDemo } from "./demo";
import { backfillEfforts } from "./efforts";
import { backfillBands } from "./bands";

const config = loadConfig();
const db = createDb(config.databasePath);
const services = createServices(db, config);
const api = createApp(db, config, { services });

const app = new Hono();
// Demo routing goes first, so demo visitors never reach the real app or database.
if (config.demo.enabled) {
  createDemo({ dir: config.demo.dir, secret: config.sessionSecret, secure: config.production, open: (file, fresh) => openDemo(file, fresh, config) })
    .mount(app).startSweeper();
}
app.route("/", api);

// In production the API also serves the built PWA.
if (fs.existsSync("dist/client")) {
  serveClient(app);
}

// Best efforts for runs synced before they existed (or after an extraction change), in the background.
void backfillEfforts(db).catch((e) => console.warn(`efforts backfill: ${(e as Error).message}`));
// Period-stats rows (time in zone and pace bands) the same way.
void backfillBands(db).catch((e) => console.warn(`bands backfill: ${(e as Error).message}`));

// The morning notification: a check each minute, only for users who turned it on.
if (config.authMode !== "demo") services.morning.start();

serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`listening on :${i.port} (auth=${config.authMode}, demo=${config.demo.enabled ? "on" : "off"})`));
