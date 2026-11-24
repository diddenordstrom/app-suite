/*
 * The race-specific phase before an A-race marathon or half (docs/decisions/fartlek-race-specific-phase.md).
 * The numbers of the phase live here; the blueprints they steer are in blueprints.ts.
 */

export const RACE_PHASE = {
  /** The weeks before the race, race week included, that make up the phase. */
  weeks: 8,
  /** Tolerated weekly km from which a third (ladder) session may stay and blueprints enter at `entryHigh`. */
  highKm: 60,
  /** A phase build week under `weekKm`, or a longest long run under `longKm`, warns (never refuses). */
  warn: { weekKm: 40, longKm: 25 },
  /** A predicted marathon pace is held to this share of critical speed at most. */
  mpCapOfCs: 0.94,
  /** Goal and prediction further apart than this share make the engine ask which to train for. */
  askPct: 0.03,
  /** Within this many days of the race no long run is moved; a missed one is dropped. */
  noMoveDays: 21,
  /** Form (%) the two build weeks before the taper aim at. */
  deepAim: -25,
  /** Under this share of judged work reps in target in a key session counts as missed paces. */
  paceMissShare: 0.5,
  /** The `READINESS.pain` limits Idag already uses: pain that stops the phase's progression. */
  injury: { level: 8, repeatLevel: 5, repeatDays: 3, windowDays: 7 },
} as const;

/** The paces (sec/km) the phase trains at; null when no source gives one (targets then fall back to zones). */
export interface RacePaces { mp: number | null; hmp: number | null }
