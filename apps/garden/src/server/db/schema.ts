import {
  blob,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { authTables } from '@homelab/server-kit';

export const household = sqliteTable('household', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  persons: integer('persons').notNull(),
  defaultPlantingUnit: text('default_planting_unit').notNull().default('area'),
  growingZone: integer('growing_zone'),
  // Secret code in the household's invite link. Rotating it invalidates old links.
  inviteCode: text('invite_code').unique(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const crop = sqliteTable('crop', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  yieldKgPerM2: real('yield_kg_per_m2').notNull(),
  yieldKgPerPlant: real('yield_kg_per_plant'),
  kcalPerKg: real('kcal_per_kg').notNull(),
  proteinGPerKg: real('protein_g_per_kg').notNull(),
  carbsGPerKg: real('carbs_g_per_kg').notNull(),
  fatGPerKg: real('fat_g_per_kg').notNull(),
  category: text('category').notNull(),
  shelfLifeWeeks: integer('shelf_life_weeks'),
  defaultConsumeKg: real('default_consume_kg'),
  weeksToTransplant: integer('weeks_to_transplant'),
  directSowOnly: integer('direct_sow_only', { mode: 'boolean' }).notNull().default(false),
  daysToMaturityFromTransplant: integer('days_to_maturity_from_transplant'),
  cropFamily: text('crop_family').notNull().default('unknown'),
  isPerennial: integer('is_perennial', { mode: 'boolean' }).notNull().default(false),
  indoorSowMonthStart: integer('indoor_sow_month_start'),
  indoorSowMonthEnd: integer('indoor_sow_month_end'),
  directSowMonthStart: integer('direct_sow_month_start'),
  directSowMonthEnd: integer('direct_sow_month_end'),
  // Minimum outdoor air temperature (°C) the crop survives unprotected.
  // Default 0 matches legacy behaviour (tender crops like tomato).
  // Source: Sustainable Market Farming, Winter-Kill Temperatures of Cold-Hardy
  // Vegetables (2018/2020/2021 editions). Phase 2 will seed per-crop values.
  minTempC: integer('min_temp_c').notNull().default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const seedVariety = sqliteTable('seed_variety', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cropId: integer('crop_id')
    .notNull()
    .references(() => crop.id),
  name: text('name').notNull(),
  varietyType: text('variety_type'),
  sowMonthStart: integer('sow_month_start'),
  sowMonthEnd: integer('sow_month_end'),
  harvestMonthStart: integer('harvest_month_start'),
  harvestMonthEnd: integer('harvest_month_end'),
  sunRequirement: text('sun_requirement'),
  wateringFrequencyDays: integer('watering_frequency_days'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const growingLocation = sqliteTable('growing_location', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id),
  name: text('name').notNull(),
  areaM2: real('area_m2').notNull(),
  description: text('description'),
  isIndoor: integer('is_indoor', { mode: 'boolean' }).notNull().default(false),
  // Degrees Celsius of thermal insulation provided by permanent protection on
  // this bed (open ground = 0, row cover = 1, cold frame = 2, polytunnel = 3,
  // unheated greenhouse = 5). Used by the frost-gate classifier to raise the
  // effective minimum temperature before comparing against crop.minTempC.
  frostBufferC: integer('frost_buffer_c').notNull().default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const planting = sqliteTable('planting', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cropId: integer('crop_id')
    .notNull()
    .references(() => crop.id),
  locationId: integer('location_id')
    .notNull()
    .references(() => growingLocation.id),
  plantedDate: text('planted_date').notNull(),
  expectedHarvestDate: text('expected_harvest_date'),
  areaM2: real('area_m2').notNull(),
  plantingMode: text('planting_mode').notNull().default('area'),
  quantity: integer('quantity'),
  seedVarietyId: integer('seed_variety_id').references(() => seedVariety.id),
  yieldKgPerPlantOverride: real('yield_kg_per_plant_override'),
  status: text('status').notNull().default('planted'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const storageItem = sqliteTable('storage_item', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cropId: integer('crop_id')
    .notNull()
    .references(() => crop.id),
  plantingId: integer('planting_id').references(() => planting.id),
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id),
  quantityKg: real('quantity_kg').notNull(),
  harvestedDate: text('harvested_date').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// Pocket ID accounts and their sessions, shared with the other apps (server-kit's createAuth).
export const { users, sessions } = authTables();

export const HOUSEHOLD_ROLES = ['owner', 'member'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export const householdMember = sqliteTable(
  'household_member',
  {
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<HouseholdRole>().notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.userId] })],
);

export type HouseholdMember = typeof householdMember.$inferSelect;

export type Household = typeof household.$inferSelect;
export type NewHousehold = typeof household.$inferInsert;

export type Crop = typeof crop.$inferSelect;
export type NewCrop = typeof crop.$inferInsert;

export type SeedVariety = typeof seedVariety.$inferSelect;
export type NewSeedVariety = typeof seedVariety.$inferInsert;

export type GrowingLocation = typeof growingLocation.$inferSelect;
export type NewGrowingLocation = typeof growingLocation.$inferInsert;

export type Planting = typeof planting.$inferSelect;
export type NewPlanting = typeof planting.$inferInsert;

export type StorageItem = typeof storageItem.$inferSelect;
export type NewStorageItem = typeof storageItem.$inferInsert;

export const harvestEvent = sqliteTable('harvest_event', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  plantingId: integer('planting_id')
    .notNull()
    .references(() => planting.id, { onDelete: 'cascade' }),
  quantityKg: real('quantity_kg').notNull(),
  harvestedDate: text('harvested_date').notNull(),
  addedToStorage: integer('added_to_storage', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export type HarvestEvent = typeof harvestEvent.$inferSelect;
export type NewHarvestEvent = typeof harvestEvent.$inferInsert;

export const macroPreset = sqliteTable('macro_preset', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  kcalPerPerson: integer('kcal_per_person').notNull(),
  proteinG: real('protein_g').notNull(),
  carbsG: real('carbs_g').notNull(),
  fatG: real('fat_g').notNull(),
  activityLevel: text('activity_level').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const macroTarget = sqliteTable('macro_target', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id),
  name: text('name').notNull(),
  dailyKcal: integer('daily_kcal').notNull(),
  dailyProteinG: real('daily_protein_g').notNull(),
  dailyCarbsG: real('daily_carbs_g').notNull(),
  dailyFatG: real('daily_fat_g').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export type MacroPreset = typeof macroPreset.$inferSelect;
export type NewMacroPreset = typeof macroPreset.$inferInsert;

export type MacroTarget = typeof macroTarget.$inferSelect;
export type NewMacroTarget = typeof macroTarget.$inferInsert;

export const cropBurnRate = sqliteTable(
  'crop_burn_rate',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id),
    cropId: integer('crop_id')
      .notNull()
      .references(() => crop.id),
    kgPerWeek: real('kg_per_week').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('crop_burn_rate_household_crop_unique').on(table.householdId, table.cropId),
  ],
);
export type CropBurnRate = typeof cropBurnRate.$inferSelect;
export type NewCropBurnRate = typeof cropBurnRate.$inferInsert;

export const activity = sqliteTable('activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id').references(() => household.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  metadata: text('metadata'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export type Activity = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;

export const gardenEvent = sqliteTable('garden_event', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id),
  title: text('title').notNull(),
  date: text('date').notNull(),
  completedAt: text('completed_at'),
  recurringDays: integer('recurring_days'),
  status: text('status'),
  cropId: integer('crop_id').references(() => crop.id),
  suggestionType: text('suggestion_type'),
  eventType: text('event_type').notNull().default('general'),
  description: text('description'),
  recurrenceRule: text('recurrence_rule'),
  dismissedAt: text('dismissed_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});
export type GardenEvent = typeof gardenEvent.$inferSelect;
export type NewGardenEvent = typeof gardenEvent.$inferInsert;

// Many-to-many: a garden event can touch multiple beds.
export const gardenEventLocation = sqliteTable(
  'garden_event_location',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => gardenEvent.id, { onDelete: 'cascade' }),
    locationId: integer('location_id')
      .notNull()
      .references(() => growingLocation.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('garden_event_location_pk').on(table.eventId, table.locationId)],
);
export type GardenEventLocation = typeof gardenEventLocation.$inferSelect;
export type NewGardenEventLocation = typeof gardenEventLocation.$inferInsert;

// Many-to-many: a garden event can touch multiple plantings.
export const gardenEventPlanting = sqliteTable(
  'garden_event_planting',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => gardenEvent.id, { onDelete: 'cascade' }),
    plantingId: integer('planting_id')
      .notNull()
      .references(() => planting.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('garden_event_planting_pk').on(table.eventId, table.plantingId)],
);
export type GardenEventPlanting = typeof gardenEventPlanting.$inferSelect;
export type NewGardenEventPlanting = typeof gardenEventPlanting.$inferInsert;

export const EVENT_TYPES = [
  'watering',
  'fertilizing',
  'pruning',
  'weeding',
  'pest_check',
  'general',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const householdCropWishlist = sqliteTable(
  'household_crop_wishlist',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id),
    cropId: integer('crop_id')
      .notNull()
      .references(() => crop.id),
    kgPerWeek: real('kg_per_week'),
    kgPerYear: real('kg_per_year'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('wishlist_household_crop_unique').on(table.householdId, table.cropId)],
);
export type HouseholdCropWishlist = typeof householdCropWishlist.$inferSelect;
export type NewHouseholdCropWishlist = typeof householdCropWishlist.$inferInsert;

export const expense = sqliteTable('expense', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id),
  name: text('name').notNull(),
  cost: real('cost').notNull(),
  date: text('date').notNull(),
  cropId: integer('crop_id').references(() => crop.id),
  locationId: integer('location_id').references(() => growingLocation.id),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});
export type Expense = typeof expense.$inferSelect;
export type NewExpense = typeof expense.$inferInsert;

export const garden = sqliteTable('garden', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // One garden per household.
  householdId: integer('household_id')
    .notNull()
    .unique()
    .references(() => household.id),
  name: text('name').notNull().default('Min trädgård'),
  widthCm: integer('width_cm').notNull(),
  heightCm: integer('height_cm').notNull(),
  cellSizeCm: integer('cell_size_cm').notNull().default(10),
  layout: text('layout').notNull().default('{"cells":{},"colors":{}}'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export type Garden = typeof garden.$inferSelect;
export type NewGarden = typeof garden.$inferInsert;

export const image = sqliteTable('image', {
  id: text('id').primaryKey(),
  bytes: blob('bytes', { mode: 'buffer' }).notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  takenAt: text('taken_at'),
  uploadedAt: text('uploaded_at').default(sql`(datetime('now'))`),
});

export type Image = typeof image.$inferSelect;
export type NewImage = typeof image.$inferInsert;

export const plantingImage = sqliteTable(
  'planting_image',
  {
    plantingId: integer('planting_id')
      .notNull()
      .references(() => planting.id, { onDelete: 'cascade' }),
    imageId: text('image_id')
      .notNull()
      .references(() => image.id, { onDelete: 'cascade' }),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.plantingId, table.imageId] })],
);

export type PlantingImage = typeof plantingImage.$inferSelect;
export type NewPlantingImage = typeof plantingImage.$inferInsert;

export const locationImage = sqliteTable(
  'location_image',
  {
    locationId: integer('location_id')
      .notNull()
      .references(() => growingLocation.id, { onDelete: 'cascade' }),
    imageId: text('image_id')
      .notNull()
      .references(() => image.id, { onDelete: 'cascade' }),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.locationId, table.imageId] })],
);

export type LocationImage = typeof locationImage.$inferSelect;
export type NewLocationImage = typeof locationImage.$inferInsert;

// Companion planting: pair-based relationships between crops, with mandatory
// citation. Schema enforces canonical-ordered (cropAId < cropBId) inserts
// via UNIQUE(cropAId, cropBId) — the service layer normalises lookups so
// callers can pass either direction.
export const companionPlanting = sqliteTable(
  'companion_planting',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cropAId: integer('crop_a_id')
      .notNull()
      .references(() => crop.id, { onDelete: 'cascade' }),
    cropBId: integer('crop_b_id')
      .notNull()
      .references(() => crop.id, { onDelete: 'cascade' }),
    relationship: text('relationship').notNull(),
    evidenceLevel: text('evidence_level').notNull(),
    source: text('source').notNull(),
    note: text('note'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('companion_pair_unique').on(table.cropAId, table.cropBId)],
);

export type CompanionPlanting = typeof companionPlanting.$inferSelect;
export type NewCompanionPlanting = typeof companionPlanting.$inferInsert;

export const COMPANION_RELATIONSHIPS = ['good', 'bad'] as const;
export type CompanionRelationship = (typeof COMPANION_RELATIONSHIPS)[number];

export const COMPANION_EVIDENCE_LEVELS = ['strong', 'traditional'] as const;
export type CompanionEvidenceLevel = (typeof COMPANION_EVIDENCE_LEVELS)[number];

// Crop-family rotation rules: how long a family must be excluded or penalised
// after growing in a bed. exclusionYears = hard cutoff (0 = soft only),
// penaltyYears = soft window used for ranking. No defaults on integer columns —
// every row is explicit seed data.
export const cropFamilyRotation = sqliteTable('crop_family_rotation', {
  family: text('family').primaryKey(),
  exclusionYears: integer('exclusion_years').notNull(),
  penaltyYears: integer('penalty_years').notNull(),
  source: text('source').notNull(),
  sourceNote: text('source_note'),
});

export type CropFamilyRotation = typeof cropFamilyRotation.$inferSelect;
export type NewCropFamilyRotation = typeof cropFamilyRotation.$inferInsert;

// Successor-bonus table: a negative bonusScore ranks the successor higher
// (bonus), a positive score ranks it lower (penalty). Per-row magnitude needed
// for the two-tier legume bonus (−15 / −10 / +15 split).
export const familyRotationBonus = sqliteTable(
  'family_rotation_bonus',
  {
    predecessorFamily: text('predecessor_family').notNull(),
    successorFamily: text('successor_family').notNull(),
    bonusScore: integer('bonus_score').notNull(),
    source: text('source').notNull(),
  },
  (table) => [primaryKey({ columns: [table.predecessorFamily, table.successorFamily] })],
);

export type FamilyRotationBonus = typeof familyRotationBonus.$inferSelect;
export type NewFamilyRotationBonus = typeof familyRotationBonus.$inferInsert;

// Per-household kr/kg price on a crop. Drives derived monetary valuations on
// the Finances page (realized + forecast value of harvests). Entirely
// user-entered — no seed data. Currency is hardcoded as "kr" for v1.
export const householdCropPrice = sqliteTable(
  'household_crop_price',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id),
    cropId: integer('crop_id')
      .notNull()
      .references(() => crop.id),
    pricePerKg: real('price_per_kg').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('household_crop_price_unique').on(table.householdId, table.cropId)],
);

export type HouseholdCropPrice = typeof householdCropPrice.$inferSelect;
export type NewHouseholdCropPrice = typeof householdCropPrice.$inferInsert;
