import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { KEEP_MIGRATION_BACKUPS, backupBeforeMigrate, openDb } from "./db";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/** A temp dir with a migrations folder holding the given SQL migrations, in order. */
function setup(...sqls: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-"));
  dirs.push(dir);
  const mig = path.join(dir, "drizzle");
  write(mig, sqls);
  return { dir, mig, file: path.join(dir, "data", "app.db") };
}

function write(mig: string, sqls: string[]) {
  fs.mkdirSync(path.join(mig, "meta"), { recursive: true });
  const entries = sqls.map((sql, idx) => {
    const tag = `000${idx}_m`;
    fs.writeFileSync(path.join(mig, `${tag}.sql`), sql);
    return { idx, version: "6", when: 1_700_000_000_000 + idx, tag, breakpoints: true };
  });
  fs.writeFileSync(path.join(mig, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "sqlite", entries }));
}

const backups = (dir: string) => fs.readdirSync(path.join(dir, "data")).filter((f) => f.endsWith(".bak"));

describe("openDb backups", () => {
  it("copies an existing database before a pending migration, not a new one or an up-to-date one", () => {
    const { dir, mig, file } = setup("CREATE TABLE notes (id integer primary key, body text);");
    openDb(file, {}, mig).$client.prepare("insert into notes (body) values ('keep me')").run();
    expect(backups(dir)).toEqual([]); // new database: nothing to keep

    openDb(file, {}, mig);
    expect(backups(dir)).toEqual([]); // nothing pending

    write(mig, ["CREATE TABLE notes (id integer primary key, body text);", "ALTER TABLE notes ADD tag text;"]);
    openDb(file, {}, mig);
    const [bak] = backups(dir);
    expect(bak).toMatch(/^app\.db\.pre-migrate-.*\.bak$/);
    const copy = new Database(path.join(dir, "data", bak), { readonly: true });
    expect(copy.prepare("select body from notes").all()).toEqual([{ body: "keep me" }]);
    expect(copy.prepare("select name from pragma_table_info('notes')").all()).toEqual([{ name: "id" }, { name: "body" }]);
    copy.close();
  });

  it("keeps only the newest backups", () => {
    const { dir, file } = setup("CREATE TABLE t (id integer);");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = new Database(file);
    sqlite.exec("CREATE TABLE t (id integer)");
    for (let i = 0; i < KEEP_MIGRATION_BACKUPS + 2; i++) backupBeforeMigrate(sqlite, file, new Date(Date.UTC(2026, 10, 1 + i)));
    const kept = backups(dir).sort();
    expect(kept).toHaveLength(KEEP_MIGRATION_BACKUPS);
    expect(kept[0]).toContain("2026-11-03");
    sqlite.close();
  });
});
