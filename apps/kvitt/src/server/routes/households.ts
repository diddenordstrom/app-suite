/** /h/:hid — household detail, admin actions, own profile. */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import { households, memberships } from "../db/schema";
import type { EventBus } from "../events";
import { arr, badRequest, currency, forbidden, idParam, int, notFound, optStr, randomToken, readBody, str } from "../http";
import { recoveryUrl, requireAdmin, toMember, type AppEnv } from "../viewer";
import type { HouseholdDetail } from "../../shared/api";
import { CATEGORY_KEYS, MAX_LABEL_LENGTH, parseCategoryLabels, parseGiftCategories } from "../../shared/gifts";

export function householdRoutes(db: Db, config: Config, bus: EventBus) {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => {
    const me = c.get("member");
    const h = db.select().from(households).where(eq(households.id, c.get("hid"))).get();
    if (!h) throw notFound();
    const members = db.select().from(memberships).where(eq(memberships.householdId, h.id)).orderBy(memberships.id).all();
    const body: HouseholdDetail = {
      id: h.id, name: h.name, currency: h.currency,
      me: toMember(me),
      members: members.map(toMember),
      inviteCode: me.role === "admin" ? h.inviteCode : null,
      settings: { zoneKr: h.zoneKr, giftCategories: parseGiftCategories(h.giftCategories), categoryLabels: parseCategoryLabels(h.categoryLabels), hintEnabled: h.hintEnabled, hintMonths: h.hintMonths },
    };
    return c.json(body);
  });

  app.patch("/", async (c) => {
    requireAdmin(c);
    const b = await readBody(c);
    const set: Partial<typeof households.$inferInsert> = {};
    if (b.name !== undefined) set.name = str(b, "name", 60);
    if (b.currency !== undefined) set.currency = currency(b.currency);
    if (b.zoneKr !== undefined) {
      const zoneKr = int(b.zoneKr, "zoneKr", 0);
      if (zoneKr > 100000) throw badRequest("zoneKr is too large");
      set.zoneKr = zoneKr;
    }
    if (b.hintMonths !== undefined) {
      const hintMonths = int(b.hintMonths, "hintMonths", 1);
      if (hintMonths > 24) throw badRequest("hintMonths can be at most 24");
      set.hintMonths = hintMonths;
    }
    if (b.hintEnabled !== undefined) {
      if (typeof b.hintEnabled !== "boolean") throw badRequest("hintEnabled must be a boolean");
      set.hintEnabled = b.hintEnabled;
    }
    if (b.giftCategories !== undefined) {
      const cats = arr(b.giftCategories, "giftCategories", 20).map((x) => {
        if (typeof x !== "string" || x.length === 0 || x.length > 50) throw badRequest("giftCategories must be short strings");
        return x;
      });
      set.giftCategories = JSON.stringify([...new Set(cats)]);
    }
    if (b.categoryLabels !== undefined) {
      const raw = b.categoryLabels;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("categoryLabels must be an object");
      const labels: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!(CATEGORY_KEYS as readonly string[]).includes(k)) throw badRequest(`categoryLabels has an unknown category: ${k}`);
        if (typeof v !== "string") throw badRequest("categoryLabels values must be strings");
        const label = v.trim();
        if (label.length > MAX_LABEL_LENGTH) throw badRequest(`a category name can be at most ${MAX_LABEL_LENGTH} characters`);
        if (label) labels[k] = label; // empty = back to the default name
      }
      set.categoryLabels = JSON.stringify(labels);
    }
    if (Object.keys(set).length) db.update(households).set(set).where(eq(households.id, c.get("hid"))).run();
    bus.emit(c.get("hid"), "household", "balances");
    return c.json({ ok: true });
  });

  app.post("/invite/rotate", (c) => {
    requireAdmin(c);
    const inviteCode = randomToken(12);
    db.update(households).set({ inviteCode }).where(eq(households.id, c.get("hid"))).run();
    bus.emit(c.get("hid"), "household");
    return c.json({ inviteCode });
  });

  /** Admin adds someone who is not in the app (a friend or sibling who pays their share), so balances and splits can include them. */
  app.post("/members", async (c) => {
    requireAdmin(c);
    const name = str(await readBody(c), "name", 50);
    const row = db.insert(memberships).values({
      householdId: c.get("hid"), name, role: "member", token: randomToken(), managed: true, createdAt: Date.now(),
    }).returning().get();
    bus.emit(c.get("hid"), "household");
    return c.json(toMember(row));
  });

  /** Active member of this household, else 404. */
  const activeMember = (hid: number, mid: number) => {
    const m = db.select().from(memberships).where(and(eq(memberships.id, mid), eq(memberships.householdId, hid))).get();
    if (!m || m.removedAt !== null) throw notFound("member not found");
    return m;
  };

  app.delete("/members/:mid", (c) => {
    const me = requireAdmin(c);
    const m = activeMember(c.get("hid"), idParam(c, "mid"));
    if (m.id === me.id) throw badRequest("you cannot remove yourself");
    db.transaction((tx) => {
      tx.update(memberships).set({ removedAt: Date.now(), walletId: null }).where(eq(memberships.id, m.id)).run();
      // Anyone sharing the removed member's wallet goes back to their own.
      tx.update(memberships).set({ walletId: null }).where(eq(memberships.walletId, m.id)).run();
    });
    bus.emit(c.get("hid"), "household", "lists", "balances");
    return c.json({ ok: true });
  });

  /** Plånbok: join another member's wallet or leave (walletId null). Admins may set anyone; members only themselves. */
  app.patch("/members/:mid/wallet", async (c) => {
    const me = c.get("member");
    const hid = c.get("hid");
    const m = activeMember(hid, idParam(c, "mid"));
    if (m.id !== me.id && me.role !== "admin") throw forbidden("only admins can change someone else's wallet");
    const b = await readBody(c);
    const walletId = b.walletId === null ? null : int(b.walletId, "walletId", 1);
    if (walletId !== null) {
      if (walletId === m.id) throw badRequest("a member cannot join their own wallet");
      const lead = activeMember(hid, walletId);
      if (lead.walletId !== null) throw badRequest("that member already shares someone else's wallet");
      const followers = db.select({ id: memberships.id }).from(memberships)
        .where(and(eq(memberships.walletId, m.id), eq(memberships.householdId, hid))).all();
      if (followers.length) throw badRequest("others share this member's wallet; they have to leave it first");
    }
    db.update(memberships).set({ walletId }).where(eq(memberships.id, m.id)).run();
    bus.emit(hid, "household", "balances");
    return c.json({ ok: true });
  });

  app.post("/members/:mid/recovery", (c) => {
    requireAdmin(c);
    const m = activeMember(c.get("hid"), idParam(c, "mid"));
    const token = randomToken();
    db.update(memberships).set({ token }).where(eq(memberships.id, m.id)).run();
    return c.json({ recoveryUrl: recoveryUrl(config, token) });
  });

  app.get("/me/recovery", (c) => c.json({ recoveryUrl: recoveryUrl(config, c.get("member").token) }));

  app.patch("/me", async (c) => {
    const b = await readBody(c);
    const set: Partial<typeof memberships.$inferInsert> = {};
    if (b.name !== undefined) set.name = str(b, "name", 50);
    const swish = optStr(b, "swishNumber", 20);
    if (swish !== undefined) {
      if (swish !== null && !/^\+?[\d\s-]{5,20}$/.test(swish)) throw badRequest("swishNumber must be a phone number");
      set.swishNumber = swish;
    }
    if (Object.keys(set).length) db.update(memberships).set(set).where(eq(memberships.id, c.get("member").id)).run();
    bus.emit(c.get("hid"), "household");
    return c.json({ ok: true });
  });

  return app;
}
