import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const sqlOf = (file: string) => fs.readFileSync(path.resolve("drizzle", file), "utf8").split("--> statement-breakpoint");

describe("0001_archive_empty_lists", () => {
  it("archives lists with only bought items, and leaves new, open and mid-trip lists alone", () => {
    const db = new Database(":memory:");
    for (const s of sqlOf("0000_init.sql")) db.exec(s);
    db.exec(`
      insert into households (id, name, currency, invite_code, created_at) values (1, 'H', 'SEK', 'c', 0);
      insert into memberships (id, household_id, name, role, token, created_at) values (1, 1, 'A', 'admin', 't', 0);
      insert into lists (id, household_id, owner_id, title, created_at, updated_at) values
        (1, 1, 1, 'all bought', 0, 0), (2, 1, 1, 'brand new', 0, 0), (3, 1, 1, 'some left', 0, 0), (4, 1, 1, 'mid trip', 0, 0);
      insert into trips (id, household_id, shopper_id, status, started_at) values (1, 1, 1, 'closed', 0), (2, 1, 1, 'active', 0);
      insert into items (list_id, text, status, trip_id, created_at, updated_at) values
        (1, 'milk', 'bought', 1, 0, 0), (3, 'eggs', 'bought', 1, 0, 0), (3, 'bread', 'open', null, 0, 0), (4, 'jam', 'bought', 1, 0, 0);
      insert into trip_lists (trip_id, list_id) values (1, 1), (2, 4);
    `);
    for (const s of sqlOf("0001_archive_empty_lists.sql")) db.exec(s);
    const archived = db.prepare("select title from lists where archived_at is not null order by id").all();
    expect(archived).toEqual([{ title: "all bought" }]);
    expect(db.prepare("select count(*) n from items").get()).toEqual({ n: 4 });
  });
});

describe("0002_bjudningar", () => {
  it("keeps existing expenses as ordinary shared expenses and gives households the default settings", () => {
    const db = new Database(":memory:");
    for (const f of ["0000_init.sql", "0001_archive_empty_lists.sql"]) for (const s of sqlOf(f)) db.exec(s);
    db.exec(`
      insert into households (id, name, currency, invite_code, created_at) values (1, 'H', 'SEK', 'c', 0);
      insert into memberships (id, household_id, name, role, token, created_at) values (1, 1, 'A', 'admin', 't', 0);
      insert into expenses (id, household_id, created_by_id, payer_id, title, amount, split_mode, date, created_at, updated_at)
        values (1, 1, 1, 1, 'Pizza', 50000, 'equal', '2026-11-01', 0, 0);
    `);
    for (const s of sqlOf("0002_bjudningar.sql")) db.exec(s);
    expect(db.prepare("select gift, guests, guest_amount from expenses").get()).toEqual({ gift: 0, guests: 0, guest_amount: 0 });
    expect(db.prepare("select zone_kr, gift_categories, hint_enabled, hint_months from households").get())
      .toEqual({ zone_kr: 100, gift_categories: '["homecooked","houseparty","round","fika"]', hint_enabled: 1, hint_months: 1 });
  });
});

describe("0003_category_slots", () => {
  const upTo2 = () => {
    const db = new Database(":memory:");
    for (const f of ["0000_init.sql", "0001_archive_empty_lists.sql", "0002_bjudningar.sql"]) for (const s of sqlOf(f)) db.exec(s);
    return db;
  };
  const run = (db: InstanceType<typeof Database>) => { for (const s of sqlOf("0003_category_slots.sql")) db.exec(s); };

  it("moves households on the old default to the new default and adds empty labels", () => {
    const db = upTo2();
    db.exec("insert into households (id, name, currency, invite_code, created_at) values (1, 'H', 'SEK', 'c', 0);");
    run(db);
    expect(db.prepare("select gift_categories, category_labels from households").get()).toEqual({ gift_categories: '["home"]', category_labels: "{}" });
  });

  it("maps customised gift categories and stored expense categories to the five slots, leaving free text alone", () => {
    const db = upTo2();
    db.exec(`
      insert into households (id, name, currency, invite_code, gift_categories, created_at) values (1, 'H', 'SEK', 'c', '["fika","houseparty","homecooked","Brädspel"]', 0);
      insert into households (id, name, currency, invite_code, gift_categories, created_at) values (2, 'G', 'SEK', 'd', '["other"]', 0);
      insert into memberships (id, household_id, name, role, token, created_at) values (1, 1, 'A', 'admin', 't', 0);
      insert into expenses (id, household_id, created_by_id, payer_id, title, amount, split_mode, category, date, created_at, updated_at) values
        (1, 1, 1, 1, 'a', 100, 'equal', 'homecooked', '2026-11-01', 0, 0),
        (2, 1, 1, 1, 'b', 100, 'equal', 'houseparty', '2026-11-01', 0, 0),
        (3, 1, 1, 1, 'c', 100, 'equal', 'round', '2026-11-01', 0, 0),
        (4, 1, 1, 1, 'd', 100, 'equal', 'fika', '2026-11-01', 0, 0),
        (5, 1, 1, 1, 'e', 100, 'equal', 'Bio', '2026-11-01', 0, 0),
        (6, 1, 1, 1, 'f', 100, 'equal', NULL, '2026-11-01', 0, 0);
    `);
    run(db);
    const cats = (id: number) => (JSON.parse((db.prepare("select gift_categories g from households where id = ?").get(id) as { g: string }).g) as string[]).sort();
    expect(cats(1)).toEqual(["Brädspel", "home", "other"]);
    expect(cats(2)).toEqual(["other"]);
    expect(db.prepare("select category from expenses order by id").all().map((r) => (r as { category: string | null }).category))
      .toEqual(["home", "home", "drinks", "other", "Bio", null]);
  });
});
