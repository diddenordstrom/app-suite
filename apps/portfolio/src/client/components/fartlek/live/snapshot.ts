/**
 * The demo account's data the Fartlek page renders, as Fartlek's API returns it. Regenerate with
 * apps/portfolio/scripts/fartlek-snapshot.mjs (see ../data/README.md); the JSON is checked against
 * these types only by this cast, so a Fartlek type change shows up as a broken screen, not a type error.
 */
import type { ActivityDetail, BlocksData, HomeData, RacePredictionData, TrendsData } from "@fartlek/client/types";
import type { Race, Settings } from "@fartlek/shared/types";
import raw from "../data/demo-snapshot.json";
import { t, type MsgKey } from "../../../i18n";

export interface Snapshot {
  _meta: { source: string; generatedFor: string };
  settings: Settings;
  today: { home: HomeData };
  load: Pick<TrendsData, "today" | "load" | "weekly">;
  pace: Pick<TrendsData, "today" | "best" | "cs" | "threshold">;
  fuel: Pick<TrendsData, "today" | "log">;
  race: { today: string; races: Race[]; predictions: RacePredictionData[] };
  block: BlocksData;
  activity: { detail: ActivityDetail };
}

/**
 * The demo's block, run and activity names as they are in the JSON (the seed mixes English and
 * Swedish) → the page's own string, so they follow the page's language. Keep in step with `NAMES`
 * in scripts/fartlek-landing-tune.py, which fails on a name missing here.
 */
export const DEMO_NAMES: Record<string, MsgKey> = {
  "Base": "fartlek.landing.demo.base",
  "Build": "fartlek.landing.demo.build",
  "Marathon-specific": "fartlek.landing.demo.specific",
  "Taper": "fartlek.landing.demo.taper",
  "Long run": "fartlek.landing.demo.longRun",
  "Easy run": "fartlek.landing.demo.easyRun",
  "Tröskel 3x2 km": "fartlek.landing.demo.threshold",
  "Morning run": "fartlek.landing.demo.morningRun",
  "Commute ride": "fartlek.landing.demo.commute",
};

/** Every string value that is exactly a demo name, swapped for its translation (a copy; the JSON is untouched). */
function localize<T>(v: T): T {
  if (typeof v === "string") return (v in DEMO_NAMES ? t(DEMO_NAMES[v]) : v) as T;
  if (Array.isArray(v)) return v.map(localize) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, localize(x)])) as T;
  return v;
}

export const SNAPSHOT = localize(raw) as unknown as Snapshot;
