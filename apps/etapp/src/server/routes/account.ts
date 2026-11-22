/** Routes outside a trip: /me, joining, recovery, creating trips. */
import { Hono } from "hono";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import { memberships, trips } from "../db/schema";
import type { EventBus } from "../events";
import { ApiError, notFound, optStr, randomToken, readBody, str } from "../http";
import { addMemberToken, type AppEnv } from "../viewer";
import { createDay } from "../planStore";
import type { MeResponse } from "../../shared/api";

export function accountRoutes(db: Db, config: Config, bus: EventBus) {
  const app = new Hono<AppEnv>();

  app.get("/me", (c) => {
    const { user, memberships: ms } = c.get("viewer");
    const ts = ms.length
      ? db.select().from(trips).where(inArray(trips.id, ms.map((m) => m.tripId))).all()
      : [];
    const body: MeResponse = {
      user: user && { id: user.id, name: user.name, email: user.email },
      authMode: config.authMode,
      trips: ms.flatMap((m) => {
        const t = ts.find((x) => x.id === m.tripId);
        return t ? [{ id: t.id, name: t.name, memberId: m.id, role: m.role }] : [];
      }),
    };
    return c.json(body);
  });

  const byCode = (code: string) => {
    const t = db.select().from(trips).where(eq(trips.inviteCode, code)).get();
    if (!t) throw notFound("invite link is invalid or has been replaced");
    return t;
  };

  app.get("/join/:code", (c) => {
    const t = byCode(c.req.param("code"));
    const mine = c.get("viewer").memberships.find((m) => m.tripId === t.id);
    return c.json({ tripName: t.name, tripId: t.id, memberId: mine?.id ?? null });
  });

  app.post("/join/:code", async (c) => {
    const t = byCode(c.req.param("code"));
    const { user, memberships: ms } = c.get("viewer");
    const mine = ms.find((m) => m.tripId === t.id);
    if (mine) return c.json({ tripId: t.id, memberId: mine.id });

    const name = str(await readBody(c), "name", 50);
    // Link the OIDC user unless they already have a (removed) membership row here; userId+trip is unique.
    const linkUser = user && !db.select({ id: memberships.id }).from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.tripId, t.id))).get();
    const token = randomToken();
    const row = db.insert(memberships).values({
      tripId: t.id, userId: linkUser ? user.id : null, name, role: "member", token, createdAt: Date.now(),
    }).returning().get();
    await addMemberToken(c, db, config, token);
    bus.emit(t.id, "trip");
    return c.json({ tripId: t.id, memberId: row.id });
  });

  app.get("/recover/:token", async (c) => {
    const token = c.req.param("token");
    const m = db.select().from(memberships).where(and(eq(memberships.token, token), isNull(memberships.removedAt))).get();
    if (!m) return c.redirect("/?error=invalid-recovery");
    await addMemberToken(c, db, config, token);
    return c.redirect("/");
  });

  app.post("/trips", async (c) => {
    const user = c.get("viewer").user;
    if (!user) throw new ApiError(401, "log in to create a trip");
    const b = await readBody(c);
    const name = str(b, "name", 60);
    const adminName = optStr(b, "adminName", 50) ?? user.name ?? user.email ?? "Admin";
    const now = Date.now();
    const id = db.transaction((tx) => {
      const t = tx.insert(trips).values({ name, inviteCode: randomToken(12), createdAt: now }).returning().get();
      tx.insert(memberships).values({
        tripId: t.id, userId: user.id, name: adminName, role: "admin", token: randomToken(), createdAt: now,
      }).run();
      createDay(tx, t.id);
      return t.id;
    });
    return c.json({ id });
  });

  return app;
}
