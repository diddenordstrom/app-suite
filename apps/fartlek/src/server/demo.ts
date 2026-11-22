import type { DemoInstance } from "@homelab/server-kit";
import type { Config } from "./config";
import { createApp } from "./app";
import { createAuth } from "@homelab/server-kit";
import { createDb } from "./db";
import { sessions, users } from "./db/schema";
import { loadDemoData } from "./seed";

/** fartlek on one demo visitor's own database file (server-kit `createDemo` decides which). */
export async function openDemo(file: string, fresh: boolean, config: Config): Promise<DemoInstance> {
  const db = createDb(file);
  if (fresh) {
    await loadDemoData(db, createAuth(db, config, { users, sessions }).demoUser().id);
    // Seeding writes a few MB of WAL; fold it into the file so an open demo stays small on disk.
    db.$client.pragma("wal_checkpoint(TRUNCATE)");
  }
  const app = createApp(db, { ...config, authMode: "demo" });
  return { fetch: app.fetch, close: () => db.$client.close() };
}
