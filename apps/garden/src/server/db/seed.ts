import { sql } from 'drizzle-orm';
import type { DB } from './index';
import {
  companionPlanting,
  crop,
  cropFamilyRotation,
  familyRotationBonus,
  macroPreset,
} from './schema';
import {
  COMPANION_PAIRS,
  CROPS,
  FAMILY_ROTATION_BONUSES,
  FAMILY_ROTATION_RULES,
  MACRO_PRESETS,
} from './seed-data';

/**
 * Global reference data (crops, macro presets, companion and rotation rules), upserted on every
 * startup so changes to seed-data.ts reach existing databases. Household data is never touched.
 */
export function seedReferenceData(db: DB): void {
  db.insert(crop)
    .values(CROPS)
    .onConflictDoUpdate({
      target: crop.name,
      set: {
        yieldKgPerM2: sql`excluded.yield_kg_per_m2`,
        yieldKgPerPlant: sql`excluded.yield_kg_per_plant`,
        kcalPerKg: sql`excluded.kcal_per_kg`,
        proteinGPerKg: sql`excluded.protein_g_per_kg`,
        carbsGPerKg: sql`excluded.carbs_g_per_kg`,
        fatGPerKg: sql`excluded.fat_g_per_kg`,
        category: sql`excluded.category`,
        shelfLifeWeeks: sql`excluded.shelf_life_weeks`,
        defaultConsumeKg: sql`excluded.default_consume_kg`,
        weeksToTransplant: sql`excluded.weeks_to_transplant`,
        directSowOnly: sql`excluded.direct_sow_only`,
        daysToMaturityFromTransplant: sql`excluded.days_to_maturity_from_transplant`,
        cropFamily: sql`excluded.crop_family`,
        isPerennial: sql`excluded.is_perennial`,
        indoorSowMonthStart: sql`excluded.indoor_sow_month_start`,
        indoorSowMonthEnd: sql`excluded.indoor_sow_month_end`,
        directSowMonthStart: sql`excluded.direct_sow_month_start`,
        directSowMonthEnd: sql`excluded.direct_sow_month_end`,
      },
    })
    .run();
  db.insert(macroPreset).values(MACRO_PRESETS).onConflictDoNothing().run();

  // Companion-planting pairs. We resolve crop ids from names so the seed file
  // stays human-readable, and store them in canonical (smaller id first) form
  // so a single row covers both directions of the pair. onConflictDoNothing
  // makes this idempotent on every startup.
  const cropIdByName = new Map<string, number>();
  for (const row of db.select({ id: crop.id, name: crop.name }).from(crop).all()) {
    cropIdByName.set(row.name, row.id);
  }
  for (const pair of COMPANION_PAIRS) {
    const aId = cropIdByName.get(pair.cropAName);
    const bId = cropIdByName.get(pair.cropBName);
    if (aId === undefined || bId === undefined || aId === bId) {
      continue;
    }
    const [smaller, larger] = aId <= bId ? [aId, bId] : [bId, aId];
    db.insert(companionPlanting)
      .values({
        cropAId: smaller,
        cropBId: larger,
        relationship: pair.relationship,
        evidenceLevel: pair.evidenceLevel,
        source: pair.source,
        note: pair.note ?? null,
      })
      .onConflictDoNothing()
      .run();
  }

  // Family rotation rules — per-family exclusion and penalty windows.
  for (const rule of FAMILY_ROTATION_RULES) {
    db.insert(cropFamilyRotation).values(rule).onConflictDoNothing().run();
  }

  // Legume-predecessor bonus rows.
  for (const bonus of FAMILY_ROTATION_BONUSES) {
    db.insert(familyRotationBonus).values(bonus).onConflictDoNothing().run();
  }
}
