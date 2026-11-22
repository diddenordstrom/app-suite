import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Served name of the push handlers; pass it to VitePWA as `workbox.importScripts: [PUSH_SW]`. */
export const PUSH_SW = "push-sw.js";

/**
 * Adds push-sw.js (the push and notification-tap handlers, docs/decisions/web-push.md) to the build, so the
 * Workbox service worker can import it. In dev it is served too, for a dev service worker.
 */
export function pushServiceWorker(): Plugin {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "src", PUSH_SW);
  return {
    name: "homelab-push-sw",
    configureServer(server) {
      server.middlewares.use(`/${PUSH_SW}`, (_req, res) => {
        res.setHeader("content-type", "text/javascript");
        res.end(fs.readFileSync(file));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: PUSH_SW, source: fs.readFileSync(file, "utf8") });
    },
  };
}
