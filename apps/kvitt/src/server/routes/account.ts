/** Routes outside a household: /me, joining, recovery, creating households. */
import { Hono } from "hono";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import { households, memberships } from "../db/schema";
import type { EventBus } from "../events";
import { ApiError, currency, notFound, optStr, randomToken, readBody, str } from "../http";
import { addMemberToken, type AppEnv } from "../viewer";
import type { MeResponse } from "../../shared/api";
import { DEFAULT_GIFT_CATEGORIES } from "../../shared/gifts";

export function accountRoutes(db: Db, config: Config, bus: EventBus) {
  const app = new Hono<AppEnv>();

  app.get("/me", (c) => {
    const { user, memberships: ms } = c.get("viewer");
    const hs = ms.length
      ? db.select().from(households).where(inArray(households.id, ms.map((m) => m.householdId))).all()
      : [];
    const body: MeResponse = {
      user: user && { id: user.id, name: user.name, email: user.email },
      authMode: config.authMode,
      households: ms.flatMap((m) => {
        const h = hs.find((x) => x.id === m.householdId);
        return h ? [{ id: h.id, name: h.name, currency: h.currency, memberId: m.id, role: m.role }] : [];
      }),
    };
    return c.json(body);
  });

  const byCode = (code: string) => {
    const h = db.select().from(households).where(eq(households.inviteCode, code)).get();
    if (!h) throw notFound("invite link is invalid or has been replaced");
    return h;
  };

  app.get("/join/:code", (c) => {
    const h = byCode(c.req.param("code"));
    const mine = c.get("viewer").memberships.find((m) => m.householdId === h.id);
    return c.json({ householdName: h.name, householdId: h.id, memberId: mine?.id ?? null });
  });

  app.post("/join/:code", async (c) => {
    const h = byCode(c.req.param("code"));
    const { user, memberships: ms } = c.get("viewer");
    const mine = ms.find((m) => m.householdId === h.id);
    if (mine) return c.json({ householdId: h.id, memberId: mine.id });

    const name = str(await readBody(c), "name", 50);
    // Link the OIDC user unless they already have a (removed) membership row here; userId+household is unique.
    const linkUser = user && !db.select({ id: memberships.id }).from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.householdId, h.id))).get();
    const token = randomToken();
    const row = db.insert(memberships).values({
      householdId: h.id, userId: linkUser ? user.id : null, name, role: "member", token, createdAt: Date.now(),
    }).returning().get();
    await addMemberToken(c, db, config, token);
    bus.emit(h.id, "household");
    return c.json({ householdId: h.id, memberId: row.id });
  });

  app.get("/recover/:token", async (c) => {
    const token = c.req.param("token");
    const m = db.select().from(memberships).where(and(eq(memberships.token, token), isNull(memberships.removedAt))).get();
    if (!m) return c.redirect("/?error=invalid-recovery");
    await addMemberToken(c, db, config, token);
    return c.redirect("/");
  });

  app.post("/households", async (c) => {
    const user = c.get("viewer").user;
    if (!user) throw new ApiError(401, "log in to create a household");
    const b = await readBody(c);
    const name = str(b, "name", 60);
    const cur = b.currency === undefined ? "SEK" : currency(b.currency);
    const adminName = optStr(b, "adminName", 50) ?? user.name ?? user.email ?? "Admin";
    const now = Date.now();
    const id = db.transaction((tx) => {
      const h = tx.insert(households).values({ name, currency: cur, giftCategories: JSON.stringify(DEFAULT_GIFT_CATEGORIES), inviteCode: randomToken(12), createdAt: now }).returning().get();
      tx.insert(memberships).values({
        householdId: h.id, userId: user.id, name: adminName, role: "admin", token: randomToken(), createdAt: now,
      }).run();
      return h.id;
    });
    return c.json({ id });
  });

  return app;
}
