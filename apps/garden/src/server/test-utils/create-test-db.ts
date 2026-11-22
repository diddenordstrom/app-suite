import { createDb } from '../db/index';

/** A fresh in-memory database with every migration in ./drizzle applied, so tests run against the real schema. */
export function createTestDb() {
  return createDb(':memory:');
}

export type TestDB = ReturnType<typeof createTestDb>;
