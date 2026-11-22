/** /t/:tid — trip detail, admin actions, own profile. */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import { memberships, trips } from "../db/schema";
import type { EventBus } from "../events";
import { badRequest, idParam, notFound, optLatLon, optText, randomToken, readBody, str } from "../http";
import { recoveryUrl, requireAdmin, toMember, type AppEnv } from "../viewer";
import type { TripDetail } from "../../shared/api";

export function tripRoutes(db: Db, config: Config, bus: EventBus) {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => {
    const me = c.get("member");
    const t = db.select().from(trips).where(eq(trips.id, c.get("tid"))).get();
    if (!t) throw notFound();
    const members = db.select().from(memberships).where(eq(memberships.tripId, t.id)).orderBy(memberships.id).all();
    const body: TripDetail = {
      id: t.id, name: t.name,
      me: toMember(me),
      home: { label: me.homeLabel, lat: me.homeLat, lon: me.homeLon },
      members: members.map(toMember),
      inviteCode: me.role === "admin" ? t.inviteCode : null,
    };
    return c.json(body);
  });

  app.patch("/", async (c) => {
    requireAdmin(c);
    const b = await readBody(c);
    const set: Partial<typeof trips.$inferInsert> = {};
    if (b.name !== undefined) set.name = str(b, "name", 60);
    if (Object.keys(set).length) db.update(trips).set(set).where(eq(trips.id, c.get("tid"))).run();
    bus.emit(c.get("tid"), "trip");
    return c.json({ ok: true });
  });

  app.post("/invite/rotate", (c) => {
    requireAdmin(c);
    const inviteCode = randomToken(12);
    db.update(trips).set({ inviteCode }).where(eq(trips.id, c.get("tid"))).run();
    bus.emit(c.get("tid"), "trip");
    return c.json({ inviteCode });
  });

  /** Active traveller on this trip, else 404. */
  const activeMember = (tid: number, mid: number) => {
    const m = db.select().from(memberships).where(and(eq(memberships.id, mid), eq(memberships.tripId, tid))).get();
    if (!m || m.removedAt !== null) throw notFound("member not found");
    return m;
  };

  app.delete("/members/:mid", (c) => {
    const me = requireAdmin(c);
    const m = activeMember(c.get("tid"), idParam(c, "mid"));
    if (m.id === me.id) throw badRequest("you cannot remove yourself");
    db.update(memberships).set({ removedAt: Date.now() }).where(eq(memberships.id, m.id)).run();
    bus.emit(c.get("tid"), "trip");
    return c.json({ ok: true });
  });

  app.post("/members/:mid/recovery", (c) => {
    requireAdmin(c);
    const m = activeMember(c.get("tid"), idParam(c, "mid"));
    const token = randomToken();
    db.update(memberships).set({ token }).where(eq(memberships.id, m.id)).run();
    return c.json({ recoveryUrl: recoveryUrl(config, token) });
  });

  app.get("/me/recovery", (c) => c.json({ recoveryUrl: recoveryUrl(config, c.get("member").token) }));

  app.patch("/me", async (c) => {
    const b = await readBody(c);
    const set: Partial<typeof memberships.$inferInsert> = {};
    if (b.name !== undefined) set.name = str(b, "name", 50);
    const homeLabel = optText(b, "homeLabel", 120);
    if (homeLabel !== undefined) set.homeLabel = homeLabel;
    const home = optLatLon(b, "homeLat", "homeLon");
    if (home) { set.homeLat = home.lat; set.homeLon = home.lon; }
    if (Object.keys(set).length) db.update(memberships).set(set).where(eq(memberships.id, c.get("member").id)).run();
    bus.emit(c.get("tid"), "trip");
    return c.json({ ok: true });
  });

  return app;
}
