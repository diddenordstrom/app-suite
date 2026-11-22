import path from "node:path";
import { createAuth, type DemoInstance } from "@homelab/server-kit";
import type { Config } from "./config";
import { createApp } from "./app";
import { createDb } from "./db";
import { sessions, users } from "./db/schema";
import { EventBus } from "./events";
import { forbidden } from "./http";
import { PhotoStore } from "./photos";
import { seedDemo } from "./seed";

/** Demo visitors can't upload photos (disk), and their store points at an empty folder, never the real uploads. */
class DemoPhotos extends PhotoStore {
  override save(): string {
    throw forbidden("Photos can't be uploaded in the demo");
  }
}

/** Etapp on one demo visitor's own database file (server-kit `createDemo` decides which), with the demo trip. */
export function openDemo(file: string, fresh: boolean, config: Config): DemoInstance {
  const db = createDb(file);
  if (fresh) {
    const { sub, email, name } = createAuth(db, config, { users, sessions }).demoUser();
    seedDemo(db, { sub, email, name: name ?? "Demo" });
    // Seeding writes a few MB of WAL; fold it into the file so an open demo stays small on disk.
    db.$client.pragma("wal_checkpoint(TRUNCATE)");
  }
  const app = createApp(db, { ...config, authMode: "demo" }, new EventBus(), new DemoPhotos(path.join(path.dirname(file), "no-uploads")));
  return { fetch: app.fetch, close: () => db.$client.close() };
}
