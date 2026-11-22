import { describe, it, expect } from 'vitest';
import {
  getZoneFrostDates,
  getLastFrostDate,
  getFirstFrostDate,
  ZONE_FROST_DATES,
  ZONE_WINTER_LOW_C,
  getExpectedMinTempC,
} from './growing-zones';

describe('ZONE_FROST_DATES', () => {
  it('has data for all 8 zones', () => {
    for (let zone = 1; zone <= 8; zone++) {
      expect(ZONE_FROST_DATES[zone]).toBeDefined();
    }
  });

  it('has the correct structure for each zone', () => {
    for (let zone = 1; zone <= 8; zone++) {
      const data = getZoneFrostDates(zone);
      expect(data).toHaveProperty('lastFrostDate');
      expect(data).toHaveProperty('firstFrostDate');
      expect(data.lastFrostDate).toHaveProperty('month');
      expect(data.lastFrostDate).toHaveProperty('day');
      expect(data.firstFrostDate).toHaveProperty('month');
      expect(data.firstFrostDate).toHaveProperty('day');
    }
  });
});

describe('getZoneFrostDates', () => {
  it('returns correct data for zone 1 (Malmö/Helsingborg)', () => {
    const result = getZoneFrostDates(1);
    expect(result.lastFrostDate).toEqual({ month: 4, day: 27 });
    expect(result.firstFrostDate).toEqual({ month: 11, day: 6 });
  });

  it('returns correct data for zone 2 (Stockholm/Göteborg)', () => {
    const result = getZoneFrostDates(2);
    expect(result.lastFrostDate).toEqual({ month: 5, day: 8 });
    expect(result.firstFrostDate).toEqual({ month: 10, day: 15 });
  });

  it('returns correct data for zone 3 (Örebro/Växjö)', () => {
    const result = getZoneFrostDates(3);
    expect(result.lastFrostDate).toEqual({ month: 5, day: 16 });
    expect(result.firstFrostDate).toEqual({ month: 10, day: 1 });
  });

  it('returns correct data for zone 4 (Uppsala)', () => {
    const result = getZoneFrostDates(4);
    expect(result.lastFrostDate).toEqual({ month: 5, day: 16 });
    expect(result.firstFrostDate).toEqual({ month: 9, day: 27 });
  });

  it('returns correct data for zone 5 (Umeå/Borlänge)', () => {
    const result = getZoneFrostDates(5);
    expect(result.lastFrostDate).toEqual({ month: 6, day: 2 });
    expect(result.firstFrostDate).toEqual({ month: 9, day: 17 });
  });

  it('returns correct data for zone 6 (Östersund/Luleå)', () => {
    const result = getZoneFrostDates(6);
    expect(result.lastFrostDate).toEqual({ month: 6, day: 8 });
    expect(result.firstFrostDate).toEqual({ month: 9, day: 10 });
  });

  it('returns correct data for zone 7 (Fjällnära)', () => {
    const result = getZoneFrostDates(7);
    expect(result.lastFrostDate).toEqual({ month: 6, day: 15 });
    expect(result.firstFrostDate).toEqual({ month: 8, day: 25 });
  });

  it('returns correct data for zone 8 (Fjäll/alpin)', () => {
    const result = getZoneFrostDates(8);
    expect(result.lastFrostDate).toEqual({ month: 6, day: 22 });
    expect(result.firstFrostDate).toEqual({ month: 8, day: 19 });
  });

  it('throws for zone 0 (below valid range)', () => {
    expect(() => getZoneFrostDates(0)).toThrow();
  });

  it('throws for zone 9 (above valid range)', () => {
    expect(() => getZoneFrostDates(9)).toThrow();
  });
});

describe('getLastFrostDate', () => {
  it('returns a Date for zone 2, May 8, 2025', () => {
    const result = getLastFrostDate(2, 2025);
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(4); // 0-indexed: May = 4
    expect(result.getDate()).toBe(8);
  });

  it('returns a Date for zone 1, Apr 27, 2024', () => {
    const result = getLastFrostDate(1, 2024);
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(3); // April = 3
    expect(result.getDate()).toBe(27);
  });
});

describe('getFirstFrostDate', () => {
  it('returns a Date for zone 2, Oct 15, 2025', () => {
    const result = getFirstFrostDate(2, 2025);
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(9); // 0-indexed: October = 9
    expect(result.getDate()).toBe(15);
  });

  it('returns a Date for zone 8, Aug 19, 2026', () => {
    const result = getFirstFrostDate(8, 2026);
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7); // August = 7
    expect(result.getDate()).toBe(19);
  });
});

// =============================================================================
// ZONE_WINTER_LOW_C
// =============================================================================

describe('ZONE_WINTER_LOW_C', () => {
  it('has values for all 8 zones', () => {
    for (let zone = 1; zone <= 8; zone++) {
      expect(ZONE_WINTER_LOW_C[zone]).toBeDefined();
    }
  });

  it('values are negative (below freezing) for all zones', () => {
    for (let zone = 1; zone <= 8; zone++) {
      expect(ZONE_WINTER_LOW_C[zone]).toBeLessThan(0);
    }
  });

  it('zone 1 (Skånes kust) is warmest', () => {
    // Zone 1 should have the least-negative value (warmest)
    for (let zone = 2; zone <= 8; zone++) {
      expect(ZONE_WINTER_LOW_C[1]).toBeGreaterThan(ZONE_WINTER_LOW_C[zone]!);
    }
  });

  it('zone 8 (Fjälltrakter) is coldest', () => {
    // Zone 8 should have the most-negative value (coldest)
    for (let zone = 1; zone <= 7; zone++) {
      expect(ZONE_WINTER_LOW_C[8]).toBeLessThan(ZONE_WINTER_LOW_C[zone]!);
    }
  });
});

// =============================================================================
// getExpectedMinTempC
// =============================================================================

describe('getExpectedMinTempC', () => {
  // Zone 2: lastFrost = May 8, firstFrost = Oct 15, winterLow = -5

  it('returns 0 at lastFrostDate (by definition)', () => {
    const result = getExpectedMinTempC(2, new Date(2026, 4, 8)); // May 8
    expect(result).toBeCloseTo(0, 1);
  });

  it('returns 0 at firstFrostDate (by definition)', () => {
    const result = getExpectedMinTempC(2, new Date(2026, 9, 15)); // Oct 15
    expect(result).toBeCloseTo(0, 1);
  });

  it('returns ZONE_WINTER_LOW_C[zone] at Jan 15', () => {
    const result = getExpectedMinTempC(2, new Date(2026, 0, 15)); // Jan 15
    expect(result).toBeCloseTo(ZONE_WINTER_LOW_C[2]!, 1);
  });

  it('returns +10 at Jul 15 (summer plateau)', () => {
    const result = getExpectedMinTempC(2, new Date(2026, 6, 15)); // Jul 15
    expect(result).toBeCloseTo(10, 1);
  });

  it('interpolates linearly between lastFrost and Jul 15 (mid-spring)', () => {
    // Zone 2: lastFrost May 8 (0°C), Jul 15 (10°C)
    // Mid-point in time between them → ~5°C
    const lastFrost = new Date(2026, 4, 8); // May 8
    const summer = new Date(2026, 6, 15); // Jul 15
    const midMs = (lastFrost.getTime() + summer.getTime()) / 2;
    const mid = new Date(midMs);
    const result = getExpectedMinTempC(2, mid);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
    // Should be approximately halfway between 0 and 10
    expect(result).toBeCloseTo(5, 0);
  });

  it('interpolates linearly between firstFrost and next Jan 15 (mid-autumn)', () => {
    // Zone 2: firstFrost Oct 15 (0°C), next Jan 15 (-5°C)
    // Midpoint → approximately -2.5°C
    const firstFrost = new Date(2026, 9, 15); // Oct 15
    const nextJan15 = new Date(2027, 0, 15); // Jan 15 next year
    const midMs = (firstFrost.getTime() + nextJan15.getTime()) / 2;
    const mid = new Date(midMs);
    const result = getExpectedMinTempC(2, mid);
    expect(result).toBeLessThan(0);
    expect(result).toBeGreaterThan(ZONE_WINTER_LOW_C[2]!);
    expect(result).toBeCloseTo(-2.5, 0);
  });

  it('wraps correctly for early January dates (between previous firstFrost and current Jan 15)', () => {
    // Jan 5 should be between firstFrost 2026 (Oct 15) and Jan 15 2027
    // so the result should be negative (below zero), between -5 and 0
    const result = getExpectedMinTempC(2, new Date(2027, 0, 5)); // Jan 5, 2027
    expect(result).toBeLessThan(0);
    expect(result).toBeGreaterThanOrEqual(ZONE_WINTER_LOW_C[2]!);
  });

  it('throws on invalid zone 0', () => {
    expect(() => getExpectedMinTempC(0, new Date(2026, 4, 1))).toThrow();
  });

  it('throws on invalid zone 9', () => {
    expect(() => getExpectedMinTempC(9, new Date(2026, 4, 1))).toThrow();
  });

  it('handles zone 8 (coldest) correctly at Jan 15', () => {
    const result = getExpectedMinTempC(8, new Date(2026, 0, 15));
    expect(result).toBeCloseTo(ZONE_WINTER_LOW_C[8]!, 1); // -28
  });

  it('returns 0 for zone 1 at lastFrostDate (Apr 27)', () => {
    const result = getExpectedMinTempC(1, new Date(2026, 3, 27)); // Apr 27
    expect(result).toBeCloseTo(0, 1);
  });
});
