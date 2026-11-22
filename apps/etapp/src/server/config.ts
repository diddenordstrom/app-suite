import path from "node:path";
import { loadAuthConfig, type AuthConfig } from "@homelab/server-kit";

export interface Config extends AuthConfig {
  port: number;
  databasePath: string;
  /** Day cover photos; defaults to "uploads" next to the database. */
  uploadsDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databasePath = env.DATABASE_PATH ?? "./data/app.db";
  return {
    ...loadAuthConfig(env, { databasePath, publicUrl: "http://localhost:5190" }),
    port: Number(env.PORT ?? 3200),
    databasePath,
    uploadsDir: env.UPLOADS_DIR ?? path.join(path.dirname(databasePath), "uploads"),
  };
}
