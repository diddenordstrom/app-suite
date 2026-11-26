/**
 * Seconds a run spent in each period-stats measure (docs/decisions/fartlek-period-stats.md): HR zones,
 * below / at / over threshold pace and at the target pace. Pure: the server stores one row per run.
 */
import { BAND_SHARE, type BandSecs, type PaceBand } from "./periodstats";
import { goalPace } from "./recovery";
import { sampleSecs, zoneSecsFor } from "./zones";
import type { ISODate } from "./dates";
import type { Activity, Race, Settings, Stream } from "./types";

/** Below this speed (m/s, slower than 16:40 /km) a sample is standing still: it counts in no pace band. */
export const MIN_SPEED = 1;

/** Pace ± `share`; `low` is the fast end (fewer seconds per km), `high` the slow end. */
export function paceBand(pace: number, share = BAND_SHARE): PaceBand {
  const r = (n: number) => Math.round(n * 10) / 10;
  return { pace: r(pace), low: r(pace * (1 - share)), high: r(pace * (1 + share)) };
}

/** Grade-adjusted speed when at least half the samples have it (as best efforts do), else raw speed. */
export function usesGap(s: Stream): boolean {
  const n = s.gap?.filter((v) => v != null).length ?? 0;
  return n > 0 && n >= s.t.length / 2;
}

export interface BandInputs {
  /** Threshold pace (s/km) that held on the run's date; null = none. */
  thresholdPace: number | null;
  /** Today's target pace (s/km); null = none. */
  targetPace: number | null;
}

export const emptyBands = (): BandSecs => ({ totalS: 0, zones: [0, 0, 0, 0, 0], belowS: 0, atS: 0, overS: 0, targetS: 0 });

/**
 * One run's seconds per measure. Zones: the runner's zones on the stream, else Garmin's (`zoneSecsFor`).
 * Pace bands judge each sample's GAP (raw speed without GAP), weighted like the zones (pauses capped).
 * `totalS` is the moving seconds of the stream; without a stream, the run's duration.
 */
export function bandSecs(
  a: Pick<Activity, "zoneSecs" | "durationS">,
  stream: Stream | null,
  settings: Pick<Settings, "zones">,
  inputs: BandInputs,
): BandSecs & { gap: boolean } {
  const out = emptyBands();
  const zs = zoneSecsFor(a, stream, settings);
  if (zs) out.zones = [...zs] as BandSecs["zones"];
  if (!stream || stream.t.length < 2) return { ...out, totalS: Math.round(a.durationS), gap: false };
  const gap = usesGap(stream);
  const thr = inputs.thresholdPace ? paceBand(inputs.thresholdPace) : null;
  const tgt = inputs.targetPace ? paceBand(inputs.targetPace) : null;
  stream.t.forEach((_, i) => {
    const v = (gap ? stream.gap![i] ?? stream.speed[i] : stream.speed[i]);
    if (v == null || v < MIN_SPEED) return;
    const dt = sampleSecs(stream.t, i);
    const pace = 1000 / v;
    out.totalS += dt;
    if (thr) {
      if (pace > thr.high) out.belowS += dt;
      else if (pace < thr.low) out.overS += dt;
      else out.atS += dt;
    }
    if (tgt && pace >= tgt.low && pace <= tgt.high) out.targetS += dt;
  });
  return { ...out, gap };
}

/** Today's target: the next A race (on or after today) with a goal time, else its locked race pace. */
export function targetRace(races: Race[], today: ISODate): { race: Race; pace: number } | null {
  const ahead = races.filter((r) => r.priority === "A" && r.date >= today).sort((x, y) => x.date.localeCompare(y.date));
  for (const r of ahead) {
    if (r.goalSeconds && r.distanceKm > 0) return { race: r, pace: Math.round(goalPace(r.goalSeconds, r.distanceKm) * 100) / 100 };
    const half = Math.abs(r.distanceKm - 21.0975) <= 1;
    const locked = half ? r.hmpSec ?? r.mpSec : r.mpSec ?? r.hmpSec;
    if (locked) return { race: r, pace: locked };
  }
  return null;
}

/** Sums of runs' bands (a period's totals). */
export function sumBands(list: BandSecs[]): BandSecs {
  const out = emptyBands();
  for (const b of list) {
    out.totalS += b.totalS; out.belowS += b.belowS; out.atS += b.atS; out.overS += b.overS; out.targetS += b.targetS;
    b.zones.forEach((z, i) => { out.zones[i] += z; });
  }
  return out;
}

/** Share of zone time in zones 1–2, 0–1; null without zone time. */
export function easyShareOf(b: BandSecs): number | null {
  const all = b.zones.reduce((x, y) => x + y, 0);
  return all ? (b.zones[0] + b.zones[1]) / all : null;
}
