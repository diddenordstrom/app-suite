import type { Db } from "../db";
import * as repo from "../repo";
import { deleteSession, getSession, gymDay, lastTimes, listSessions, saveSession } from "../gym";
import { checkSession, improvements, type GymSessionInput } from "../../shared/gymplan";
import { parseBoltCsv } from "../../shared/boltcsv";
import { todayIn } from "../../shared/dates";
import { BadRequest, body, date, idParam, router } from "./util";
import { HTTPException } from "hono/http-exception";

/** A Bolt export of several years is well under this. */
const MAX_IMPORT_BYTES = 2_000_000;

export function gymRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  r.get("/gym", (c) => {
    const q = c.req.query("date");
    const d = q ? date(q) : todayIn(repo.getSettings(db, uid(c)).timezone);
    return c.json(gymDay(db, uid(c), d));
  });

  r.post("/gym/sessions", async (c) => {
    const b = await body(c);
    const errors = checkSession(b);
    if (errors.length) return c.json({ errors }, 400);
    const s = b as unknown as GymSessionInput;
    const before = lastTimes(db, uid(c));
    const saved = saveSession(db, uid(c), s);
    const last = saved.created ? before : lastTimes(db, uid(c), saved.id);
    return c.json({ id: saved.id, created: saved.created, improvements: improvements(s.entries, last) }, saved.created ? 201 : 200);
  });

  r.get("/gym/sessions", (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50));
    return c.json(listSessions(db, uid(c), { limit }));
  });

  r.get("/gym/sessions/:id", (c) => {
    const s = getSession(db, uid(c), idParam(c.req.param("id")));
    if (!s) throw new HTTPException(404, { message: "not found" });
    return c.json(s);
  });

  r.delete("/gym/sessions/:id", (c) => {
    deleteSession(db, uid(c), idParam(c.req.param("id")));
    return c.json({ ok: true });
  });

  /** A CSV export from Bolt; sessions already imported are skipped, so importing twice is harmless. */
  r.post("/gym/import", async (c) => {
    const b = await body(c);
    if (typeof b.csv !== "string" || !b.csv.trim()) throw new BadRequest("csv is required");
    if (b.csv.length > MAX_IMPORT_BYTES) throw new BadRequest("the file is too big");
    const parsed = parseBoltCsv(b.csv);
    if (!parsed.sessions.length) return c.json({ errors: parsed.errors.length ? parsed.errors : ["no sessions in the file"] }, 400);
    let added = 0, sets = 0;
    for (const s of parsed.sessions) {
      const res = saveSession(db, uid(c), { ...s, source: "bolt" });
      if (res.created) { added++; sets += s.entries.reduce((n, e) => n + e.sets.length, 0); }
    }
    return c.json({ added, skipped: parsed.sessions.length - added, sets, unknown: parsed.unknown, rowErrors: parsed.errors.length });
  });

  return r;
}
