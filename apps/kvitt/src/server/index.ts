import fs from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createDemo, serveClient } from "@homelab/server-kit";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { openDemo } from "./demo";

const config = loadConfig();
const db = createDb(config.databasePath);
const api = createApp(db, config);

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

serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`listening on :${i.port} (auth=${config.authMode}, demo=${config.demo.enabled ? "on" : "off"})`));
