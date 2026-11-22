import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-utils/create-test-db';
import { cropFamilyRotation } from './schema';

describe('crop_family_rotation table', () => {
  it('should exist in the test DB and accept a round-trip insert', () => {
    // Arrange
    const db = createTestDb();

    // Act
    db.insert(cropFamilyRotation)
      .values({
        family: 'Brassicaceae',
        exclusionYears: 6,
        penaltyYears: 0,
        source: 'https://example.com',
      })
      .run();

    const rows = db.select().from(cropFamilyRotation).all();

    // Assert
    expect(rows).toHaveLength(1);
    expect(rows[0]!.family).toBe('Brassicaceae');
    expect(rows[0]!.exclusionYears).toBe(6);
    expect(rows[0]!.penaltyYears).toBe(0);
  });
});
