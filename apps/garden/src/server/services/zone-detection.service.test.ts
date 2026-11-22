import { describe, it, expect } from 'vitest';
import { detectGrowingZone } from './zone-detection.service';

describe('detectGrowingZone', () => {
  describe('returns null for coordinates outside Sweden', () => {
    it('returns null for Copenhagen (Denmark)', () => {
      const result = detectGrowingZone({ latitude: 55.6, longitude: 12.5 });
      expect(result).toBeNull();
    });

    it('returns null for Oslo (Norway)', () => {
      const result = detectGrowingZone({ latitude: 59.9, longitude: 10.7 });
      expect(result).toBeNull();
    });

    it('returns null for Helsinki (Finland)', () => {
      const result = detectGrowingZone({ latitude: 60.2, longitude: 24.9 });
      expect(result).toBeNull();
    });

    it('returns null for Berlin (Germany)', () => {
      const result = detectGrowingZone({ latitude: 52.5, longitude: 13.4 });
      expect(result).toBeNull();
    });
  });

  describe('zone 1 — southernmost Sweden', () => {
    it('detects zone 1 for Malmö', () => {
      const result = detectGrowingZone({ latitude: 55.6, longitude: 13.0 });
      expect(result).toBe(1);
    });

    it('detects zone 1 for Helsingborg', () => {
      const result = detectGrowingZone({ latitude: 56.0, longitude: 12.7 });
      expect(result).toBe(1);
    });

    it('detects zone 1 for Visby (Gotland)', () => {
      const result = detectGrowingZone({ latitude: 57.6, longitude: 18.3 });
      expect(result).toBe(1);
    });

    it('detects zone 1 for Öland', () => {
      const result = detectGrowingZone({ latitude: 56.8, longitude: 16.7 });
      expect(result).toBe(1);
    });
  });

  describe('zone 2 — southern Sweden', () => {
    it('detects zone 2 for Gothenburg', () => {
      const result = detectGrowingZone({ latitude: 57.7, longitude: 12.0 });
      expect(result).toBe(2);
    });

    it('detects zone 2 for Kalmar', () => {
      const result = detectGrowingZone({ latitude: 56.7, longitude: 16.4 });
      expect(result).toBe(2);
    });
  });

  describe('zone 3 — central-south Sweden', () => {
    it('detects zone 3 for Linköping', () => {
      const result = detectGrowingZone({ latitude: 58.4, longitude: 15.6 });
      expect(result).toBe(3);
    });

    it('detects zone 3 for Stockholm', () => {
      const result = detectGrowingZone({ latitude: 59.3, longitude: 18.1 });
      expect(result).toBe(3);
    });
  });

  describe('zone 4 — central Sweden', () => {
    it('detects zone 4 for Uppsala', () => {
      const result = detectGrowingZone({ latitude: 59.9, longitude: 17.6 });
      expect(result).toBe(4);
    });

    it('detects zone 4 for Gävle', () => {
      const result = detectGrowingZone({ latitude: 60.7, longitude: 17.1 });
      expect(result).toBe(4);
    });
  });

  describe('zone 5 — northern-central Sweden', () => {
    it('detects zone 5 for Sundsvall', () => {
      const result = detectGrowingZone({ latitude: 62.4, longitude: 17.3 });
      expect(result).toBe(5);
    });

    it('detects zone 5 for Umeå (northern coast)', () => {
      const result = detectGrowingZone({ latitude: 63.8, longitude: 20.3 });
      expect(result).toBe(5);
    });

    it('detects zone 5 for Skellefteå (northern coast)', () => {
      const result = detectGrowingZone({ latitude: 64.7, longitude: 20.9 });
      expect(result).toBe(5);
    });
  });

  describe('zone 6 — northern Sweden', () => {
    it('detects zone 6 for Östersund', () => {
      const result = detectGrowingZone({ latitude: 63.2, longitude: 14.6 });
      expect(result).toBe(6);
    });

    it('detects zone 6 for Luleå (northern coast)', () => {
      const result = detectGrowingZone({ latitude: 65.6, longitude: 22.1 });
      expect(result).toBe(6);
    });
  });

  describe('zone 8 — far north and mountains', () => {
    it('detects zone 8 for Kiruna', () => {
      const result = detectGrowingZone({ latitude: 67.9, longitude: 20.2 });
      expect(result).toBe(8);
    });

    it('detects zone 8 for mountain area (Jämtland mountains)', () => {
      const result = detectGrowingZone({ latitude: 63.5, longitude: 13.0 });
      expect(result).toBe(8);
    });
  });

  describe('mountain adjustment', () => {
    it('increases zone for coordinates near Norwegian border in the north', () => {
      // Abisko area — far north mountains
      const result = detectGrowingZone({ latitude: 68.3, longitude: 15.5 });
      expect(result).toBe(8);
    });
  });

  describe('edge cases', () => {
    it('never returns a zone below 1', () => {
      const result = detectGrowingZone({ latitude: 55.3, longitude: 14.0 });
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it('never returns a zone above 8', () => {
      const result = detectGrowingZone({ latitude: 69.0, longitude: 15.0 });
      expect(result).toBeLessThanOrEqual(8);
    });
  });
});
