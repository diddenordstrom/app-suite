export type ZoneFrostDates = {
  lastFrostDate: { month: number; day: number };
  firstFrostDate: { month: number; day: number };
};

export const ZONE_FROST_DATES: Record<number, ZoneFrostDates> = {
  1: { lastFrostDate: { month: 4, day: 27 }, firstFrostDate: { month: 11, day: 6 } },
  2: { lastFrostDate: { month: 5, day: 8 }, firstFrostDate: { month: 10, day: 15 } },
  3: { lastFrostDate: { month: 5, day: 16 }, firstFrostDate: { month: 10, day: 1 } },
  4: { lastFrostDate: { month: 5, day: 16 }, firstFrostDate: { month: 9, day: 27 } },
  5: { lastFrostDate: { month: 6, day: 2 }, firstFrostDate: { month: 9, day: 17 } },
  6: { lastFrostDate: { month: 6, day: 8 }, firstFrostDate: { month: 9, day: 10 } },
  7: { lastFrostDate: { month: 6, day: 15 }, firstFrostDate: { month: 8, day: 25 } },
  8: { lastFrostDate: { month: 6, day: 22 }, firstFrostDate: { month: 8, day: 19 } },
};

// Expected daily minimum temperature (°C) on January 15 per Swedish growing
// zone. Source: SMHI Normalkartor, Månadsmedeltemperatur 1991–2020
// (https://www.smhi.se/klimat/klimatet-da-och-nu/normalkartor/normal/manadsmedeltemperatur-normal/alla-manader/1991-2020)
// cross-referenced with empirical Swedish gardener data.
// NOTE: These are provisional values mapped from geographic SMHI stations to
// odlingszon 1–8. They may be refined once SMHI publishes the 2001–2030
// normalperiod or if empirical feedback from gardeners reveals discrepancies.
export const ZONE_WINTER_LOW_C: Record<number, number> = {
  1: -3, // Skånes kust
  2: -5, // Sydsvenska kustområden
  3: -8, // Götalands inland
  4: -10, // Mälardalen / Svealand
  5: -13, // Södra Norrland
  6: -17, // Mellersta Norrland
  7: -22, // Norra Norrland
  8: -28, // Fjälltrakter
};

// Summer plateau temperature (°C) used as the mid-year anchor in the
// piecewise-linear temperature curve. Value is above any realistic crop
// minTempC so the SAFE classification holds for all sow/harvest dates in the
// growing season.
const SUMMER_PLATEAU_C = 10;

export function getZoneFrostDates(zone: number): ZoneFrostDates {
  if (zone < 1 || zone > 8) {
    throw new Error(`Invalid growing zone: ${zone}. Must be between 1 and 8.`);
  }
  return ZONE_FROST_DATES[zone] as ZoneFrostDates;
}

export function getLastFrostDate(zone: number, year: number): Date {
  const { lastFrostDate } = getZoneFrostDates(zone);
  return new Date(year, lastFrostDate.month - 1, lastFrostDate.day);
}

export function getFirstFrostDate(zone: number, year: number): Date {
  const { firstFrostDate } = getZoneFrostDates(zone);
  return new Date(year, firstFrostDate.month - 1, firstFrostDate.day);
}

function lerp(t0: number, v0: number, t1: number, v1: number, t: number): number {
  const frac = (t - t0) / (t1 - t0);
  return v0 + frac * (v1 - v0);
}

/**
 * Returns the expected daily minimum air temperature (°C) for the given zone
 * on the given date, computed via piecewise-linear interpolation through five
 * annual anchor points:
 *
 *   Jan 15 → ZONE_WINTER_LOW_C[zone]    (coldest midwinter)
 *   lastFrostDate → 0°C                 (by definition of last frost)
 *   Jul 15 → +10°C                      (summer plateau)
 *   firstFrostDate → 0°C                (by definition of first frost)
 *   next Jan 15 → ZONE_WINTER_LOW_C[zone]
 *
 * Wraps correctly across the year boundary (early-January dates fall between
 * the previous year's firstFrostDate and the current-year Jan 15).
 *
 * Pure function — no I/O. Throws on invalid zone (1–8).
 */
export function getExpectedMinTempC(zone: number, date: Date): number {
  const winterLow = ZONE_WINTER_LOW_C[zone];
  if (winterLow === undefined) {
    throw new Error(`Invalid growing zone: ${zone}. Must be between 1 and 8.`);
  }
  const year = date.getFullYear();
  const t = date.getTime();
  return interpolateTemperature(zone, year, t, winterLow);
}

/** Separated to keep getExpectedMinTempC below statement limit. */
function interpolateTemperature(zone: number, year: number, t: number, winterLow: number): number {
  // Anchor points ordered chronologically across the year (with prev-year wrap).
  const anchors: [number, number][] = [
    [getFirstFrostDate(zone, year - 1).getTime(), 0],
    [new Date(year, 0, 15).getTime(), winterLow],
    [getLastFrostDate(zone, year).getTime(), 0],
    [new Date(year, 6, 15).getTime(), SUMMER_PLATEAU_C],
    [getFirstFrostDate(zone, year).getTime(), 0],
    [new Date(year + 1, 0, 15).getTime(), winterLow],
  ];

  for (let i = 0; i < anchors.length - 1; i++) {
    const [t0, v0] = anchors[i]!;
    const [t1, v1] = anchors[i + 1]!;
    if (t >= t0 && t <= t1) {
      return lerp(t0, v0, t1, v1, t);
    }
  }

  // Fallback for dates outside all anchors (extreme edge cases).
  const last = anchors[anchors.length - 1]!;
  return t < anchors[0]![0] ? anchors[0]![1] : last[1];
}
