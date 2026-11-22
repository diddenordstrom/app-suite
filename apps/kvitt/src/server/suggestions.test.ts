import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { items } from "./db/schema";
import type { ItemSuggestion, List } from "../shared/api";

const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);

describe("GET /h/:hid/items/suggestions", () => {
  it("groups household history by trimmed lower-case text, latest casing/quantity, ranked by count then recency", async () => {
    const db = createDb(":memory:");
    const app = createApp(db, config);
    const req = async <T>(method: string, path: string, body?: unknown, cookie?: string) => {
      const headers: Record<string, string> = { origin: config.publicUrl };
      if (body !== undefined) headers["content-type"] = "application/json";
      if (cookie) headers.cookie = cookie;
      const r = await app.request(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, json: (await r.json()) as T };
    };

    const { json: { id: hid } } = await req<{ id: number }>("POST", "/households", { name: "Home", adminName: "Alice" });
    const { json: { id: other } } = await req<{ id: number }>("POST", "/households", { name: "Other" });
    const { json: a } = await req<List>("POST", `/h/${hid}/lists`, { title: "A" });
    const { json: b } = await req<List>("POST", `/h/${hid}/lists`, { title: "B" });
    const { json: o } = await req<List>("POST", `/h/${other}/lists`, { title: "O" });

    const row = (listId: number, text: string, quantity: string | null, at: number, status: "open" | "bought" = "bought") =>
      ({ listId, text, quantity, status, createdAt: at, updatedAt: at });
    db.insert(items).values([
      row(a.id, "milk", "1 l", 100),
      row(b.id, " Milk ", null, 300),
      row(a.id, "MILK", "2 l", 200, "open"),
      row(a.id, "Eggs", "12", 500),
      row(b.id, "eggs", null, 400),
      row(a.id, "Bread", null, 600),
      row(a.id, "Butter", null, 50),
      row(o.id, "Secret", null, 999),
    ]).run();

    const { status, json } = await req<ItemSuggestion[]>("GET", `/h/${hid}/items/suggestions`);
    expect(status).toBe(200);
    expect(json).toEqual([
      { text: "Milk", quantity: null, count: 3, lastUsed: 300 },
      { text: "Eggs", quantity: "12", count: 2, lastUsed: 500 },
      { text: "Bread", quantity: null, count: 1, lastUsed: 600 },
      { text: "Butter", quantity: null, count: 1, lastUsed: 50 },
    ]);

    // Non-members are rejected by the household middleware.
    expect((await req("GET", `/h/${hid}/items/suggestions`, undefined, "dev_anon=1")).status).toBe(403);
  });
});
