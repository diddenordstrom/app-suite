import { openDb } from "@homelab/server-kit";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(file: string) {
  return openDb(file, schema);
}
