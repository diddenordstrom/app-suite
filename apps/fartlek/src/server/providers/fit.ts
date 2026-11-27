import { Decoder, Stream as FitStream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";
import type { Lap, LapTrigger, Stream, ZoneBounds } from "../../shared/types";
import type { ProviderDetail } from "./types";

/** Garmin's download endpoint returns a ZIP holding `<id>_ACTIVITY.fit`. Accepts a raw FIT too. */
export function extractFit(bytes: Uint8Array): Uint8Array {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".fit"));
    if (!name) throw new Error("no .fit file in the download");
    return files[name];
  }
  return bytes;
}

interface LapMesg {
  startTime?: Date; totalTimerTime?: number; totalElapsedTime?: number; totalDistance?: number; avgHeartRate?: number; maxHeartRate?: number;
  avgRunningCadence?: number; avgCadence?: number; avgFractionalCadence?: number; totalAscent?: number; totalDescent?: number; lapTrigger?: string;
}
interface RecordMesg {
  /** Undocumented field 140: grade-adjusted speed in mm/s (what Garmin Connect shows as GAP). */
  140?: number;
  timestamp?: Date; heartRate?: number; enhancedSpeed?: number; speed?: number; enhancedAltitude?: number; altitude?: number; cadence?: number; fractionalCadence?: number;
}

const TRIGGERS: Record<string, LapTrigger> = {
  manual: "manual", distance: "distance", time: "time", sessionEnd: "end",
  positionStart: "position", positionLap: "position", positionWaypoint: "position", positionMarked: "position",
};

/** Garmin stores running cadence per foot (strides/min) plus a fraction; Fartlek shows steps per minute. */
export function stepsPerMinute(perFoot: number | undefined, fraction: number | undefined): number | null {
  if (perFoot == null || perFoot <= 0) return null;
  return Math.round((perFoot + (fraction ?? 0)) * 2);
}

const round = (v: number | undefined, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * Garmin's grade-adjusted speed (m/s) when it looks like one: the field is undocumented, so it is only
 * believed within a plausible factor of the real speed.
 */
export function gapSpeed(r: RecordMesg, speed: number | undefined): number | null {
  const raw = r[140];
  if (raw == null || speed == null) return null;
  const v = raw / 1000;
  if (speed < 0.5) return v < 0.5 ? v : null;
  const f = v / speed;
  return f >= 0.6 && f <= 1.6 ? v : null;
}

/**
 * Parse once on sync into laps + a ~5 s stream (D25). `gap: true` also reads Garmin's grade-adjusted
 * speed, for step detection's on-demand parse (shared/streamsteps.ts); it is never stored.
 */
export function parseFit(bytes: Uint8Array, bucket = 5, opts: { gap?: boolean } = {}): ProviderDetail {
  const fit = extractFit(bytes);
  const decoder = new Decoder(FitStream.fromByteArray(Array.from(fit)));
  if (!decoder.isFIT()) throw new Error("not a FIT file");
  const { messages, errors } = decoder.read(opts.gap ? { includeUnknownData: true } : undefined);
  if (errors.length && !messages?.recordMesgs?.length) throw new Error(`FIT decode failed: ${String(errors[0])}`);

  const records = ((messages.recordMesgs ?? []) as RecordMesg[]).filter((r) => r.timestamp);
  const t0 = records[0]?.timestamp!.getTime() ?? null;

  const laps: Lap[] = ((messages.lapMesgs ?? []) as LapMesg[]).map((l, index) => ({
    index,
    distanceM: l.totalDistance ?? 0,
    durationS: l.totalTimerTime ?? l.totalElapsedTime ?? 0,
    avgHr: l.avgHeartRate ?? null,
    startS: t0 != null && l.startTime ? Math.max(0, Math.round((l.startTime.getTime() - t0) / 1000)) : null,
    trigger: l.lapTrigger ? (TRIGGERS[l.lapTrigger] ?? "other") : null,
    maxHr: l.maxHeartRate ?? null,
    cadence: stepsPerMinute(l.avgRunningCadence ?? l.avgCadence, l.avgFractionalCadence),
    elevGain: round(l.totalAscent),
    elevLoss: round(l.totalDescent),
  }));

  let stream: Stream | null = null;
  if (records.length && t0 != null) {
    const buckets = new Map<number, { hr: number[]; sp: number[]; alt: number[]; cad: number[]; gap: number[] }>();
    for (const r of records) {
      const k = Math.floor((r.timestamp!.getTime() - t0) / 1000 / bucket) * bucket;
      const b = buckets.get(k) ?? { hr: [], sp: [], alt: [], cad: [], gap: [] };
      if (r.heartRate != null) b.hr.push(r.heartRate);
      const sp = r.enhancedSpeed ?? r.speed;
      if (sp != null) b.sp.push(sp);
      if (opts.gap) { const g = gapSpeed(r, sp); if (g != null) b.gap.push(g); }
      const alt = r.enhancedAltitude ?? r.altitude;
      if (alt != null) b.alt.push(alt);
      const cad = stepsPerMinute(r.cadence, r.fractionalCadence);
      if (cad != null) b.cad.push(cad);
      buckets.set(k, b);
    }
    const avg = (xs: number[], d: number) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10 ** d) / 10 ** d : null);
    const keys = [...buckets.keys()].sort((a, b) => a - b);
    stream = {
      t: keys,
      hr: keys.map((k) => avg(buckets.get(k)!.hr, 0)),
      speed: keys.map((k) => avg(buckets.get(k)!.sp, 2)),
      alt: keys.map((k) => avg(buckets.get(k)!.alt, 1)),
      cad: keys.map((k) => avg(buckets.get(k)!.cad, 0)),
    };
    if (opts.gap && keys.some((k) => buckets.get(k)!.gap.length)) stream.gap = keys.map((k) => avg(buckets.get(k)!.gap, 2));
  }
  return { laps, stream, fit };
}

interface TimeInZoneMesg { referenceMesg?: string; hrZoneHighBoundary?: number[] | number; maxHeartRate?: number; thresholdHeartRate?: number }

/** The watch's heart-rate zones as the activity was recorded with them, from the FIT file's time-in-zone message. */
export interface WatchZones { bounds: ZoneBounds; maxHr: number | null; thresholdHr: number | null }

/**
 * The watch's zones from a FIT file, or null when it has none. `hr_zone_high_boundary` holds the top of
 * each zone from zone 0 (below zone 1) up: [z0, z1, z2, z3, z4, z5], so zones 1–4's tops are entries 1–4
 * (Garmin's defaults for max 195 are 98 / 117 / 137 / 156 / 176 / 195, i.e. 50–100 %).
 */
export function watchZonesFromFit(bytes: Uint8Array): WatchZones | null {
  const decoder = new Decoder(FitStream.fromByteArray(Array.from(extractFit(bytes))));
  if (!decoder.isFIT()) return null;
  const { messages } = decoder.read();
  const all = ((messages.timeInZoneMesgs ?? []) as TimeInZoneMesg[]).filter((m) => Array.isArray(m.hrZoneHighBoundary) && m.hrZoneHighBoundary.length >= 5);
  const m = all.find((x) => x.referenceMesg === "session") ?? all.at(-1);
  if (!m) return null;
  const b = m.hrZoneHighBoundary as number[];
  const bounds = (b.length >= 6 ? b.slice(1, 5) : b.slice(0, 4)) as ZoneBounds;
  const ok = bounds.every((v, i) => v >= 40 && v <= 240 && (i === 0 || v > bounds[i - 1]!));
  if (!ok) return null;
  const hr = (v: number | undefined) => (v != null && v >= 40 && v <= 240 ? v : null);
  return { bounds, maxHr: hr(m.maxHeartRate), thresholdHr: hr(m.thresholdHeartRate) };
}
