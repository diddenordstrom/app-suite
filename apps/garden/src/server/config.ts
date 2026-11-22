import { loadAuthConfig, type AuthConfig } from '@homelab/server-kit';

export interface Config extends AuthConfig {
  port: number;
  databasePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databasePath = env.DATABASE_PATH ?? './data/app.db';
  return {
    ...loadAuthConfig(env, { databasePath, publicUrl: 'http://localhost:4200' }),
    port: Number(env.PORT ?? 3500),
    databasePath,
  };
}
