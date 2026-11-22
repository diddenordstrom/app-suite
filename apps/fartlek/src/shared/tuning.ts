/*
 * The planning engine's tweakable values, in one place (docs/decisions/fartlek-block-progression.md).
 *
 * These are the values that shape a plan without making it unsafe: how a block rises, how big a long run is
 * as a share of the week, how long easy runs are next to it, when a week is lighter. Change one here and the
 * block and week generators follow; `TUNE_RANGE` bounds each. An admin can override them per user in the settings
 * (`withTuning` makes the overrides the active values while a plan is made); a test keeps every default in its range.
 *
 * Deliberately NOT here, because a bad value can hurt the runner. They stay constants where they are:
 *  - the spike rule, no session more than 10 % over the longest run of 30 days (`NEXT.spike`, `NEXT.spikeDays`)
 *  - the weekly growth, +10 % (`COACH.weekGrowth`), the km-ramp limits (`COACH.rampCap`, `COACH.rampRisk`)
 *    and the re-entry growth (`NEXT.reentryGrowth`) and tolerance fade (`BLOCK.tolerance`)
 *  - the form bands that decide a block is too hard or too easy (`COACH.floor`, `COACH.goal`)
 *  - the share of threshold work (`NEXT.qualityMax`), the threshold ladder and the long-run ceiling in km and minutes
 */
export const TUNE = {
  /**
   * A block's build weeks aim at the tolerated km × this, rising in a straight line from `from` (first build
   * week) to `to` (last): start at what the body has handled (the last block's top week), climb 10 % through the
   * block. Starting under it (0.92 → 1.08 at first) gained only ~8 % a block, about 2 % a week.
   * Each week is still held to its safe cap, so `to` never outruns the growth rules.
   */
  ramp: { from: 1, to: 1.1 },
  /** A lighter week: this share of the week before's km, and of the long run before it. */
  lighter: { volume: 0.7, long: 0.7 },
  /**
   * The long run as a share of the week falls as the week grows: `floorShare + extraShare × e^(−(km − 20) / kmScale)`,
   * at most `maxShare` (30 km a week → 46 %, 50 → 39 %, 70 → 36 %, 90 → 33 %). A planned block's long run stops
   * stepping up when it would pass that share (it holds at the longest run so far, never shrinks), and a lighter
   * week's long run is held to it. The ladder steps by `stepShare` of the longest run, at least `stepMinKm`,
   * and never past the spike rule.
   */
  long: { floorShare: 0.3, extraShare: 0.2, kmScale: 40, maxShare: 0.6, stepShare: 0.08, stepMinKm: 1 },
  /** An easy run is at most this share of the long run, so what is left after the long run and threshold is split into as many as that takes. */
  easy: { ofLong: 0.5 },
  /**
   * The taper before an A race (docs/decisions/fartlek-race-blocks.md): the default shares of the peak week's km,
   * the first taper week and the race week, used when the simulation finds no depth that lands race-day form in
   * `COACH.race`; a B race gets a lighter race week (`bRace`) and no taper week before it.
   */
  taper: { first: 0.7, race: 0.5, bRace: 0.7 },
  /** Run days a week's volume calls for: 3 below `d4`, then 4, 5, 6 and 7 from these km a week. */
  daysFromKm: { d4: 25, d5: 40, d6: 55, d7: 70 },
  /** A week that falls this many km short of its target on the days it has needs another day. */
  shortKm: 1,
};

type Numbers<T> = { [K in keyof T]: T[K] extends number ? number : Numbers<T[K]> };
type Partials<T> = { [K in keyof T]?: T[K] extends number ? number : Partials<T[K]> };
export type Tuning = Numbers<typeof TUNE>;
export type TuningOverrides = Partials<typeof TUNE>;

/** What each number may be set to, and the step an input moves by. */
export const TUNE_RANGE = {
  ramp: { from: { min: 0.8, max: 1, step: 0.01 }, to: { min: 1, max: 1.15, step: 0.01 } },
  lighter: { volume: { min: 0.5, max: 0.9, step: 0.05 }, long: { min: 0.5, max: 0.9, step: 0.05 } },
  long: {
    floorShare: { min: 0.2, max: 0.4, step: 0.01 }, extraShare: { min: 0, max: 0.3, step: 0.01 }, kmScale: { min: 10, max: 100, step: 5 },
    maxShare: { min: 0.4, max: 0.7, step: 0.01 }, stepShare: { min: 0, max: 0.1, step: 0.01 }, stepMinKm: { min: 0.5, max: 2, step: 0.5 },
  },
  easy: { ofLong: { min: 0.3, max: 0.8, step: 0.05 } },
  taper: { first: { min: 0.5, max: 0.85, step: 0.05 }, race: { min: 0.3, max: 0.7, step: 0.05 }, bRace: { min: 0.5, max: 0.9, step: 0.05 } },
  daysFromKm: { d4: { min: 10, max: 60, step: 1 }, d5: { min: 20, max: 80, step: 1 }, d6: { min: 30, max: 100, step: 1 }, d7: { min: 40, max: 140, step: 1 } },
  shortKm: { min: 0.5, max: 3, step: 0.5 },
} as const;

interface Range { min: number; max: number; step: number }
const isRange = (r: unknown): r is Range => typeof r === "object" && r !== null && typeof (r as Range).min === "number";

/** Every tweakable number as a flat row, in table order: its path ("long.floorShare"), group, default and range. */
export interface TuneField extends Range { path: string; group: string; def: number }
export const TUNE_FIELDS: TuneField[] = (function walk(range: object, defaults: object, path: string[] = []): TuneField[] {
  return Object.entries(range).flatMap(([k, r]) => {
    const d = (defaults as Record<string, unknown>)[k];
    return isRange(r) ? [{ path: [...path, k].join("."), group: path[0] ?? k, def: d as number, min: r.min, max: r.max, step: r.step }] : walk(r, d as object, [...path, k]);
  });
})(TUNE_RANGE, TUNE);

/** Overrides merged over the defaults. */
export function resolveTuning(o: TuningOverrides | null | undefined): Tuning {
  const merge = (base: Record<string, unknown>, over: Record<string, unknown> | undefined): Record<string, unknown> =>
    Object.fromEntries(Object.entries(base).map(([k, v]) => [k, typeof v === "object" && v !== null ? merge(v as Record<string, unknown>, over?.[k] as Record<string, unknown> | undefined) : typeof over?.[k] === "number" ? over[k] : v]));
  return merge(TUNE, o as Record<string, unknown> | undefined) as unknown as Tuning;
}

/**
 * Overrides from outside (a request body, a stored row): only known numbers inside their ranges, and the result
 * must still make sense (the ramp rises, more days need more km). Null for anything else; `{}` means defaults.
 */
export function parseTuning(input: unknown): TuningOverrides | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const out: Record<string, Record<string, number> | number> = {};
  const known = new Map(TUNE_FIELDS.map((f) => [f.path, f]));
  const walk = (o: Record<string, unknown>, path: string[], into: Record<string, unknown>): boolean => {
    for (const [k, v] of Object.entries(o)) {
      const at = [...path, k].join(".");
      if (known.has(at)) {
        const f = known.get(at)!;
        if (typeof v !== "number" || !Number.isFinite(v) || v < f.min || v > f.max) return false;
        into[k] = v;
      } else if (typeof v === "object" && v !== null && !Array.isArray(v) && TUNE_FIELDS.some((x) => x.path.startsWith(`${at}.`))) {
        const sub: Record<string, unknown> = {};
        if (!walk(v as Record<string, unknown>, [...path, k], sub)) return false;
        into[k] = sub;
      } else return false;
    }
    return true;
  };
  if (!walk(input as Record<string, unknown>, [], out)) return null;
  const t = resolveTuning(out as TuningOverrides);
  const d = t.daysFromKm;
  if (!(t.ramp.from <= t.ramp.to && d.d4 < d.d5 && d.d5 < d.d6 && d.d6 < d.d7)) return null;
  return out as TuningOverrides;
}

let active: Tuning = resolveTuning(null);
/** The values in force: the defaults, or the runner's overrides while `withTuning` runs. */
export const tune = (): Tuning => active;

/** Runs `fn` (synchronously, a plan being made) with these overrides as the active values. */
export function withTuning<T>(overrides: TuningOverrides | null | undefined, fn: () => T): T {
  const prev = active;
  active = resolveTuning(overrides);
  try { return fn(); } finally { active = prev; }
}

/** The long run as a share of a week of `weekKm` (see `TUNE.long`). */
export const longShareAt = (weekKm: number) => {
  const L = tune().long;
  return Math.min(L.maxShare, L.floorShare + L.extraShare * Math.exp(-(weekKm - 20) / L.kmScale));
};
