import type { Activity, Settings, Stream, ZoneBounds } from "./types";

export type ZoneSecs = [number, number, number, number, number];

/** Seconds each sample stands for (gap to the next one, capped so pauses don't count). */
function sampleSecs(t: number[], i: number): number {
  return i + 1 < t.length ? Math.min(t[i + 1] - t[i], 30) : 5;
}

export function zoneOf(hr: number, b: ZoneBounds): number {
  return hr <= b[0] ? 0 : hr <= b[1] ? 1 : hr <= b[2] ? 2 : hr <= b[3] ? 3 : 4;
}

export function zoneSecsFromStream(s: Stream, b: ZoneBounds): ZoneSecs {
  const out: ZoneSecs = [0, 0, 0, 0, 0];
  s.hr.forEach((hr, i) => { if (hr != null) out[zoneOf(hr, b)] += sampleSecs(s.t, i); });
  return out;
}

/** User zones from the stream when both exist, else the watch's zones from Garmin (D25). */
export function zoneSecsFor(a: Pick<Activity, "zoneSecs">, stream: Stream | null, settings: Pick<Settings, "zones">): ZoneSecs | null {
  if (stream && settings.zones) return zoneSecsFromStream(stream, settings.zones);
  return a.zoneSecs;
}

export function zonesFromMaxHr(maxHr: number): ZoneBounds {
  return [0.6, 0.7, 0.8, 0.9].map((p) => Math.round(maxHr * p)) as ZoneBounds;
}

/** Friel-style running zones from lactate threshold HR. */
export function zonesFromLthr(lthr: number): ZoneBounds {
  return [0.84, 0.89, 0.94, 0.99].map((p) => Math.round(lthr * p)) as ZoneBounds;
}

export type EasyGrade = "good" | "ok" | "off";
/** Share of a run at easy effort that counts as a good / an OK easy run. */
export const EASY_GRADE = { good: 0.9, ok: 0.8 } as const;
export function gradeEasy(score: number): EasyGrade {
  return score >= EASY_GRADE.good ? "good" : score >= EASY_GRADE.ok ? "ok" : "off";
}

/**
 * Easy score (old "zone 2 score", D26): share of time at or below the easy band's top,
 * or in zones 1–2 when no band or no stream. Below easy counts as fine.
 */
export function easyScore(zs: ZoneSecs | null, stream: Stream | null, settings: Pick<Settings, "easyHigh">): number | null {
  if (stream && settings.easyHigh) {
    let ok = 0, all = 0;
    stream.hr.forEach((hr, i) => {
      if (hr == null) return;
      const s = sampleSecs(stream.t, i);
      all += s;
      if (hr <= settings.easyHigh!) ok += s;
    });
    return all ? ok / all : null;
  }
  if (!zs) return null;
  const total = zs.reduce((a, b) => a + b, 0);
  return total ? (zs[0] + zs[1]) / total : null;
}

export function hrHistogram(s: Stream, bin = 5): { bpm: number; secs: number }[] {
  const m = new Map<number, number>();
  s.hr.forEach((hr, i) => {
    if (hr == null) return;
    const k = Math.floor(hr / bin) * bin;
    m.set(k, (m.get(k) ?? 0) + sampleSecs(s.t, i));
  });
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([bpm, secs]) => ({ bpm, secs }));
}

/** Average pace (s/km) over the samples whose HR sits inside the band; null with < 5 min of such samples. */
export function paceInBand(s: Stream, low: number, high: number): { pace: number; hr: number; secs: number } | null {
  let secs = 0, dist = 0, hrSum = 0;
  s.hr.forEach((hr, i) => {
    const v = s.speed[i];
    if (hr == null || v == null || v < 1 || hr < low || hr > high) return;
    const dt = sampleSecs(s.t, i);
    secs += dt;
    dist += v * dt;
    hrSum += hr * dt;
  });
  if (secs < 300 || dist <= 0) return null;
  return { pace: secs / (dist / 1000), hr: hrSum / secs, secs };
}

export interface Distribution { low: number; mid: number; high: number; total: number }
/** Intensity distribution: zones 1–2 / zone 3 / zones 4–5 as shares of time. */
export function intensityDistribution(list: (ZoneSecs | null)[]): Distribution {
  let low = 0, mid = 0, high = 0;
  for (const z of list) if (z) { low += z[0] + z[1]; mid += z[2]; high += z[3] + z[4]; }
  const total = low + mid + high;
  return total ? { low: low / total, mid: mid / total, high: high / total, total } : { low: 0, mid: 0, high: 0, total: 0 };
}
