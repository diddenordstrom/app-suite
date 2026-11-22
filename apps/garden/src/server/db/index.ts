import { openDb } from '@homelab/server-kit';
import * as schema from './schema';

export type DB = ReturnType<typeof createDb>;

/** Open the database and apply the migrations in ./drizzle (see server-kit's openDb). */
export function createDb(file: string) {
  return openDb(file, schema);
}
