/** Day cover photos: upload (raw image body), delete, and serving to travellers on the trip. */
import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { days } from "../db/schema";
import type { EventBus } from "../events";
import { badRequest, idParam, notFound } from "../http";
import type { AppEnv } from "../viewer";
import { dayOf, photoUrl } from "../planStore";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, type PhotoStore, type PhotoType } from "../photos";

export function photoRoutes(db: Db, bus: EventBus, photos: PhotoStore) {
  const app = new Hono<AppEnv>();
  const day = (c: Context<AppEnv>) => dayOf(db, c.get("tid"), idParam(c, "id")) ?? (() => { throw notFound("day not found"); })();

  /**
   * The body is the image itself (Content-Type image/jpeg, png or webp). A cross-site page cannot send that
   * without a CORS preflight, which this server never grants, so no form-style CSRF applies here.
   */
  app.put("/days/:id/photo", async (c) => {
    const d = day(c);
    const type = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!(type in PHOTO_TYPES)) throw badRequest("photo must be a JPEG, PNG or WebP image");
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > MAX_PHOTO_BYTES) throw badRequest("photo is too large");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) throw badRequest("photo is empty");
    if (bytes.length > MAX_PHOTO_BYTES) throw badRequest("photo is too large");
    const name = photos.save(bytes, type as PhotoType);
    db.update(days).set({ photo: name }).where(eq(days.id, d.id)).run();
    photos.remove(d.photo);
    bus.emit(c.get("tid"), "plan");
    return c.json({ photoUrl: photoUrl(c.get("tid"), name) });
  });

  app.delete("/days/:id/photo", (c) => {
    const d = day(c);
    db.update(days).set({ photo: null }).where(eq(days.id, d.id)).run();
    photos.remove(d.photo);
    bus.emit(c.get("tid"), "plan");
    return c.json({ ok: true });
  });

  /** Only a photo that is currently some day's cover on this trip is served. Names are random, so cache forever. */
  app.get("/photos/:file", (c) => {
    const file = c.req.param("file");
    const owner = db.select({ id: days.id }).from(days).where(and(eq(days.tripId, c.get("tid")), eq(days.photo, file))).get();
    const found = owner && photos.read(file);
    if (!found) throw notFound();
    return c.body(new Uint8Array(found.bytes), 200, { "content-type": found.type, "cache-control": "private, max-age=31536000, immutable" });
  });

  return app;
}
