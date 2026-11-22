import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** Pre-migration backups kept next to the database; older ones are removed. */
export const KEEP_MIGRATION_BACKUPS = 3;

/** True when the journal has a migration newer than the last one applied to this database. */
export function hasPendingMigrations(sqlite: Database.Database, migrationsFolder: string): boolean {
  const journalFile = path.join(migrationsFolder, "meta", "_journal.json");
  if (!fs.existsSync(journalFile)) return false;
  const entries = (JSON.parse(fs.readFileSync(journalFile, "utf8")) as { entries: { when: number }[] }).entries;
  if (!entries.length) return false;
  const latest = Math.max(...entries.map((e) => e.when));
  const hasTable = sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'").get();
  if (!hasTable) return true;
  const row = sqlite.prepare("select max(created_at) as at from __drizzle_migrations").get() as { at: number | string | null };
  return row.at == null || Number(row.at) < latest;
}

/**
 * Copy the database before a migration touches it, so a bad release can be rolled back with the
 * data it found. `VACUUM INTO` writes a consistent copy even in WAL mode. Only the newest
 * KEEP_MIGRATION_BACKUPS copies stay, so the disk does not fill up over many releases.
 */
export function backupBeforeMigrate(sqlite: Database.Database, file: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const target = `${file}.pre-migrate-${stamp}.bak`;
  sqlite.prepare("VACUUM INTO ?").run(target);
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.pre-migrate-`;
  const old = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".bak")).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_MIGRATION_BACKUPS))) fs.rmSync(path.join(dir, f), { force: true });
  return target;
}

/**
 * Open SQLite (WAL, foreign keys on) and apply the app's Drizzle migrations at startup.
 * An existing database with pending migrations is copied first (backupBeforeMigrate); a new one is not.
 * `migrationsFolder` defaults to ./drizzle relative to the working directory (the app root, or /app in Docker).
 */
export function openDb<S extends Record<string, unknown>>(file: string, schema: S, migrationsFolder = path.resolve(process.cwd(), "drizzle")) {
  const existed = file !== ":memory:" && fs.existsSync(file);
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  if (existed && hasPendingMigrations(sqlite, migrationsFolder)) {
    const target = backupBeforeMigrate(sqlite, file);
    console.log(`Backed up ${path.basename(file)} to ${path.basename(target)} before migrating`);
  }
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
