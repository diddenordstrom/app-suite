import { eq } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import * as t from "../db/schema";
import { IntervalsError, athleteWarnings, type IntervalsPusher } from "../intervals";
import { body, idParam, router, BadRequest } from "./util";

/** intervals.icu connection: send structured workouts on to Garmin (docs/decisions/fartlek-watch-push.md). */
export function intervalsRoutes(db: Db, config: Config, pusher: IntervalsPusher) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  const status = (userId: number) => {
    const a = db.select().from(t.intervalsAccounts).where(eq(t.intervalsAccounts.userId, userId)).get();
    if (!a) return { connected: false as const };
    const sentIds = db.select({ id: t.intervalsEvents.workoutId }).from(t.intervalsEvents).where(eq(t.intervalsEvents.userId, userId)).all().map((r) => r.id);
    return { connected: true as const, athleteName: a.athleteName, connectedAt: a.connectedAt, lastPushAt: a.lastPushAt, lastError: a.lastError,
      warnings: a.warnings ? a.warnings.split(",") : [], sent: sentIds.length, sentIds };
  };

  r.get("/intervals", (c) => c.json(status(uid(c))));

  r.put("/intervals", async (c) => {
    if (config.authMode === "demo") return c.json({ error: "Not available in the demo" }, 403);
    const b = await body(c);
    const apiKey = typeof b.apiKey === "string" ? b.apiKey.trim() : "";
    if (apiKey.length < 8 || apiKey.length > 200) throw new BadRequest("Paste the full API key");
    const lang = b.lang === "en" ? "en" : "sv";
    let athlete;
    try {
      athlete = await pusher.client(apiKey).athlete();
    } catch (e) {
      throw new BadRequest(e instanceof IntervalsError ? e.message : `Could not reach intervals.icu: ${(e as Error).message}`);
    }
    const vals = { keyEnc: pusher.cipher.encrypt(apiKey), athleteId: athlete.id, athleteName: athlete.name, lang, connectedAt: Date.now(),
      lastError: null, warnings: athleteWarnings(athlete).join(",") };
    db.insert(t.intervalsAccounts).values({ userId: uid(c), ...vals }).onConflictDoUpdate({ target: t.intervalsAccounts.userId, set: vals }).run();
    // A new key may be another athlete: send everything again.
    db.delete(t.intervalsEvents).where(eq(t.intervalsEvents.userId, uid(c))).run();
    await pusher.push(uid(c)).catch(() => {});
    return c.json(status(uid(c)));
  });

  /** "Send now": push and wait, so the card can show the result. */
  r.post("/intervals/push", async (c) => {
    try {
      const res = await pusher.push(uid(c));
      if (!res) return c.json({ error: "not connected" }, 404);
      return c.json({ ...status(uid(c)), result: res });
    } catch (e) {
      throw new BadRequest((e as Error).message);
    }
  });

  /** Send one workout now (Home's "Skicka till klockan"): only upcoming running workouts with steps can go. */
  r.post("/intervals/push/:workoutId", async (c) => {
    if (!db.select().from(t.intervalsAccounts).where(eq(t.intervalsAccounts.userId, uid(c))).get()) return c.json({ error: "not connected" }, 404);
    try {
      const sent = await pusher.pushWorkout(uid(c), idParam(c.req.param("workoutId")));
      if (!sent) throw new BadRequest("Only upcoming running workouts with steps (within two weeks) can be sent");
      return c.json({ sent });
    } catch (e) {
      if (e instanceof BadRequest) throw e;
      throw new BadRequest((e as Error).message);
    }
  });

  r.delete("/intervals", async (c) => {
    await pusher.disconnect(uid(c));
    return c.json(status(uid(c)));
  });

  return r;
}
