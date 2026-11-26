/**
 * Period stats (docs/decisions/fartlek-period-stats.md): the contract between the server's
 * GET /api/stats and the Statistik page. Running only; gym and other sports are left out.
 */
import type { ISODate } from "./dates";

/** Half-width of the "at threshold" and "at target pace" bands, as a share of the pace (±3.5 %). */
export const BAND_SHARE = 0.035;

/** Seconds a run spent in each measure. Pace bands are judged on GAP, pace when the stream has none. */
export interface BandSecs {
  /** Moving seconds with a usable sample (the base for shares). */
  totalS: number;
  /** HR zones 1–5 (the runner's zones from the stream, else Garmin's). */
  zones: [number, number, number, number, number];
  /** Slower than the threshold band, inside it, faster than it. Zero when no threshold held on the run's date. */
  belowS: number;
  atS: number;
  overS: number;
  /** Inside today's target-pace band. Zero when there is no target. */
  targetS: number;
}

/** Inclusive date range. */
export interface Period { from: ISODate; to: ISODate }

export interface PeriodTotals extends BandSecs {
  period: Period;
  runs: number;
  distanceKm: number;
  longestKm: number;
  /** Share of time in zones 1–2, 0–1; null without zone data. */
  easyShare: number | null;
  /** Planned and done for the period, from the plan (workouts). */
  plan: { km: number; doneKm: number; sessions: number; doneSessions: number; key: number; doneKey: number; long: number; doneLong: number };
}

export interface RunRow {
  id: string;
  date: ISODate;
  name: string;
  distanceKm: number;
  durationS: number;
  /** Planned session kind when the run matched a workout ("threshold", "intervals", "long", "easy"…), else null. */
  kind: string | null;
  bands: BandSecs;
}

export interface PaceBand { pace: number; low: number; high: number }

export interface StatsResponse {
  a: PeriodTotals;
  b: PeriodTotals;
  /** Threshold that holds today (past runs are judged against the one on their date); null without one. */
  threshold: PaceBand | null;
  /** Today's target pace: the next A race with a goal or race pace. Null hides the target rows. */
  target: (PaceBand & { raceName: string; distanceKm: number; goalSeconds: number | null }) | null;
  /** Runs in period A, newest first. */
  runs: RunRow[];
  /** Runs in period B, newest first (for "Dag mot dag" and the B ribbon). */
  runsB: RunRow[];
  /** Weekly run km around both periods, for the timeline (Monday weeks, oldest first). */
  weeks: { weekStart: ISODate; week: number; km: number }[];
  /** Blocks overlapping the timeline. */
  blocks: { id: number; name: string; startWeek: ISODate; weeks: number }[];
  /** Runs whose bands are still being computed (the page can say "räknar…" and reload). */
  pending: number;
}
