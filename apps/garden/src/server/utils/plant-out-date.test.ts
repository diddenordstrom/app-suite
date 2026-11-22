import { describe, it, expect } from 'vitest';
import { calculatePlantOutDate } from './plant-out-date';

describe('calculatePlantOutDate()', () => {
  it('returns readyDate when readyDate is after lastFrost', () => {
    // Arrange
    // Zone 1: lastFrostDate = April 27
    // sowDate = March 1, weeksToTransplant = 9 → readyDate = May 3 > April 27
    const sowDate = new Date(2026, 2, 1); // March 1
    const weeksToTransplant = 9;
    const zone = 1;
    const year = 2026;

    // Act
    const result = calculatePlantOutDate(sowDate, weeksToTransplant, zone, year);

    // Assert: max(May 3, April 27) → May 3
    expect(result).toEqual(new Date(2026, 4, 3));
  });

  it('returns lastFrostDate when readyDate is before lastFrost', () => {
    // Arrange
    // Zone 6: lastFrostDate = June 8
    // sowDate = March 1, weeksToTransplant = 6 → readyDate = April 12 < June 8
    const sowDate = new Date(2026, 2, 1); // March 1
    const weeksToTransplant = 6;
    const zone = 6;
    const year = 2026;

    // Act
    const result = calculatePlantOutDate(sowDate, weeksToTransplant, zone, year);

    // Assert: max(April 12, June 8) → June 8
    expect(result).toEqual(new Date(2026, 5, 8));
  });

  it('returns that date when readyDate equals lastFrostDate', () => {
    // Arrange
    // Zone 3: lastFrostDate = May 16
    // sowDate = March 21, weeksToTransplant = 8 → readyDate = May 16 exactly
    const sowDate = new Date(2026, 2, 21); // March 21
    const weeksToTransplant = 8;
    const zone = 3;
    const year = 2026;

    // Act
    const result = calculatePlantOutDate(sowDate, weeksToTransplant, zone, year);

    // Assert: max(May 16, May 16) → May 16
    expect(result).toEqual(new Date(2026, 4, 16));
  });

  it('zone 1 (warm) gives earlier plant-out than zone 6 (cold) for same sowDate', () => {
    // Arrange
    // sowDate Feb 1, weeksToTransplant 4 → readyDate March 1
    // readyDate is before both zone 1 (Apr 27) and zone 6 (Jun 8) last frosts
    const sowDate = new Date(2026, 1, 1); // Feb 1
    const weeksToTransplant = 4;
    const year = 2026;

    // Act
    const resultZone1 = calculatePlantOutDate(sowDate, weeksToTransplant, 1, year);
    const resultZone6 = calculatePlantOutDate(sowDate, weeksToTransplant, 6, year);

    // Assert: zone 1 last frost (Apr 27) < zone 6 last frost (Jun 8)
    expect(resultZone1.getTime()).toBeLessThan(resultZone6.getTime());
    expect(resultZone1).toEqual(new Date(2026, 3, 27)); // April 27
    expect(resultZone6).toEqual(new Date(2026, 5, 8)); // June 8
  });

  it('throws when zone is invalid', () => {
    // Arrange
    const sowDate = new Date(2026, 2, 1);

    // Act & Assert
    expect(() => calculatePlantOutDate(sowDate, 8, 0, 2026)).toThrow(
      'Invalid growing zone: 0. Must be between 1 and 8.',
    );
    expect(() => calculatePlantOutDate(sowDate, 8, 9, 2026)).toThrow(
      'Invalid growing zone: 9. Must be between 1 and 8.',
    );
  });
});
