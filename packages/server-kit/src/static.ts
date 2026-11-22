import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

/** Vite puts content-hashed files under /assets/; a new build gets new names, so they never change. */
export const IMMUTABLE = "public, max-age=31536000, immutable";
/**
 * Everything else (index.html, client routes, manifest, icons) is revalidated on every load. Without a
 * Cache-Control header browsers cache index.html heuristically from Last-Modified, keep pointing at the
 * old bundle and run old client code against a new API.
 */
export const REVALIDATE = "no-cache";

export function cacheControlFor(requestPath: string): string {
  return requestPath.startsWith("/assets/") ? IMMUTABLE : REVALIDATE;
}

/** Serve the built client from `root`, falling back to index.html for client-side routes. Register after the API routes. */
export function serveClient(app: Hono, root = "./dist/client"): void {
  app.use("*", async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set("Cache-Control", cacheControlFor(c.req.path));
  });
  app.use("*", serveStatic({ root }));
  // A missing hashed asset (an old tab after a deploy) is a 404, never index.html cached as immutable.
  app.get("/assets/*", (c) => c.notFound());
  app.get("*", serveStatic({ path: `${root}/index.html` }));
}
