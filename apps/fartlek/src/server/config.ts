import fs from "node:fs";
import { loadAuthConfig, type AuthConfig } from "@homelab/server-kit";

export interface Config extends AuthConfig {
  port: number;
  databasePath: string;
  /**
   * Secret for encrypting Garmin keys at rest (D24). From RUNPLAN_MASTER_KEY or the file in RUNPLAN_MASTER_KEY_FILE:
   * the app was called runplan, and the variable kept its name so the deployed secret needs no change.
   */
  masterKey: string;
  garminBaseUrl: string;
  intervalsBaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databasePath = env.DATABASE_PATH ?? "./data/app.db";
  const auth = loadAuthConfig(env, { databasePath, publicUrl: "http://localhost:5173" });
  const production = auth.production;
  const cfg: Config = {
    ...auth,
    port: Number(env.PORT ?? 3000),
    databasePath,
    masterKey: readSecret(env, "RUNPLAN_MASTER_KEY") ?? "",
    garminBaseUrl: (env.GARMIN_BASE_URL ?? "https://personal.connectapi.garmin.com").replace(/\/$/, ""),
    intervalsBaseUrl: (env.INTERVALS_BASE_URL ?? "https://intervals.icu").replace(/\/$/, ""),
  };
  if (!cfg.masterKey) {
    if (production) throw new Error("RUNPLAN_MASTER_KEY (or RUNPLAN_MASTER_KEY_FILE) is required in production");
    cfg.masterKey = "dev-only-master-key";
  }
  if (production && cfg.masterKey.length < 32) throw new Error("RUNPLAN_MASTER_KEY must be at least 32 characters");
  return cfg;
}

function readSecret(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const file = env[`${name}_FILE`];
  if (file) return fs.readFileSync(file, "utf8").trim();
  return env[name] || undefined;
}
