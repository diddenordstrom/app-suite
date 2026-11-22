import fs from "node:fs";
import { serve } from "@hono/node-server";
import { serveClient } from "@homelab/server-kit";
import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = createApp();

// In production the server also serves the built page.
if (fs.existsSync("dist/client")) {
  serveClient(app);
}

serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`listening on :${i.port}`));
