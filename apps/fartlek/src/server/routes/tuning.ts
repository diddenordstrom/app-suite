import type { MiddlewareHandler } from "hono";
import type { Db } from "../db";
import * as repo from "../repo";
import { parseTuning, TUNE_FIELDS } from "../../shared/tuning";
import { body, BadRequest, router } from "./util";

/**
 * The engine's tuning table (shared/tuning.ts) for the runner's own plans. Admin only (the `admin` group at the
 * identity provider, or dev mode): a plan made with odd values is still the runner's own, but the panel is not for everyone.
 */
export function tuningRoutes(db: Db, requireAdmin: MiddlewareHandler) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;
  r.use("/admin/*", requireAdmin);

  r.get("/admin/tuning", (c) => c.json({ values: repo.getTuning(db, uid(c)) ?? {}, fields: TUNE_FIELDS }));
  r.put("/admin/tuning", async (c) => {
    const values = parseTuning((await body(c)).values);
    if (!values) throw new BadRequest("invalid tuning");
    repo.saveTuning(db, uid(c), values);
    return c.json({ values });
  });
  r.delete("/admin/tuning", (c) => {
    repo.clearTuning(db, uid(c));
    return c.json({ values: {} });
  });
  return r;
}
