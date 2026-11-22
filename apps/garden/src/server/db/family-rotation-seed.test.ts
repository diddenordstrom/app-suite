// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import * as schema from './schema';
import { FAMILY_ROTATION_RULES, FAMILY_ROTATION_BONUSES } from './seed-data';
import { createTestDb } from '../test-utils/create-test-db';

describe('Family rotation seed data', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    for (const rule of FAMILY_ROTATION_RULES) {
      db.insert(schema.cropFamilyRotation).values(rule).onConflictDoNothing().run();
    }
    for (const bonus of FAMILY_ROTATION_BONUSES) {
      db.insert(schema.familyRotationBonus).values(bonus).onConflictDoNothing().run();
    }
  });

  // T1
  it('seeds exactly 9 rows into crop_family_rotation', () => {
    // Arrange — done in beforeEach

    // Act
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Assert
    expect(rows).toHaveLength(9);
  });

  // T2
  it('every crop_family_rotation row has a source containing http', () => {
    // Arrange — done in beforeEach

    // Act
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Assert
    for (const row of rows) {
      expect(row.source).toMatch(/http/);
    }
  });

  // T3
  it('Brassicaceae row has exclusionYears=6 and penaltyYears=0', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Brassicaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(6);
    expect(row!.penaltyYears).toBe(0);
  });

  // T4
  it('Solanaceae row has exclusionYears=4 and penaltyYears=0', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Solanaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(4);
    expect(row!.penaltyYears).toBe(0);
  });

  // T5
  it('Alliaceae row has exclusionYears=0 and penaltyYears=4', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Alliaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(0);
    expect(row!.penaltyYears).toBe(4);
  });

  // T6
  it('Cucurbitaceae row has exclusionYears=0 and penaltyYears=3', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Cucurbitaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(0);
    expect(row!.penaltyYears).toBe(3);
  });

  // T7
  it('Apiaceae row has exclusionYears=0 and penaltyYears=2', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Apiaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(0);
    expect(row!.penaltyYears).toBe(2);
  });

  // T8
  it('Chenopodiaceae row has exclusionYears=0 and penaltyYears=3', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Chenopodiaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(0);
    expect(row!.penaltyYears).toBe(3);
  });

  // T9
  it('Fabaceae row has exclusionYears=0 and penaltyYears=4', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Fabaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(0);
    expect(row!.penaltyYears).toBe(4);
  });

  // T10
  it('Asteraceae row has exclusionYears=0 and penaltyYears=2', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Asteraceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(0);
    expect(row!.penaltyYears).toBe(2);
  });

  // T11
  it('Poaceae row has exclusionYears=0 and penaltyYears=2', () => {
    // Arrange
    const rows = db.select().from(schema.cropFamilyRotation).all();

    // Act
    const row = rows.find((r) => r.family === 'Poaceae');

    // Assert
    expect(row).toBeDefined();
    expect(row!.exclusionYears).toBe(0);
    expect(row!.penaltyYears).toBe(2);
  });

  // T12
  it('(Fabaceae → Brassicaceae) bonus row has bonusScore=-15', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const row = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Brassicaceae',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.bonusScore).toBe(-15);
  });

  // T13
  it('(Fabaceae → Solanaceae) bonus row has bonusScore=-15', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const row = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Solanaceae',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.bonusScore).toBe(-15);
  });

  // T14
  it('(Fabaceae → Cucurbitaceae) bonus row has bonusScore=-10', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const row = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Cucurbitaceae',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.bonusScore).toBe(-10);
  });

  // T15
  it('(Fabaceae → Poaceae) bonus row has bonusScore=-10', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const row = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Poaceae',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.bonusScore).toBe(-10);
  });

  // T16
  it('(Fabaceae → Chenopodiaceae) bonus row has bonusScore=-10', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const row = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Chenopodiaceae',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.bonusScore).toBe(-10);
  });

  // T17
  it('(Fabaceae → Asteraceae) bonus row has bonusScore=-10', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const row = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Asteraceae',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.bonusScore).toBe(-10);
  });

  // T18
  it('(Fabaceae → Fabaceae) bonus row has bonusScore=+15 (autotoxicity penalty)', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const row = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Fabaceae',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.bonusScore).toBe(15);
  });

  // T19
  it('no bonus row exists for (Fabaceae → Apiaceae) or (Fabaceae → Alliaceae)', () => {
    // Arrange
    const rows = db.select().from(schema.familyRotationBonus).all();

    // Act
    const apiaceaeRow = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Apiaceae',
    );
    const alliaceaeRow = rows.find(
      (r) => r.predecessorFamily === 'Fabaceae' && r.successorFamily === 'Alliaceae',
    );

    // Assert
    expect(apiaceaeRow).toBeUndefined();
    expect(alliaceaeRow).toBeUndefined();
  });
});
