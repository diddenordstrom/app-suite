import { eq, and, inArray, isNotNull, isNull, gte, or, sql } from 'drizzle-orm';
import type { DB } from '../db/index';
import {
  companionPlanting,
  harvestEvent,
  household,
  planting,
  growingLocation,
  householdCropWishlist,
  crop,
  gardenEvent,
  gardenEventLocation,
  gardenEventPlanting,
  storageItem,
  cropFamilyRotation,
  familyRotationBonus,
} from '../db/schema';
import type { GardenEvent, NewGardenEvent } from '../db/schema';
import { getFirstFrostDate, getLastFrostDate, getExpectedMinTempC } from '../utils/growing-zones';

// Pairs a NewGardenEvent row with the location/planting attachments that must
// be written to junction tables after the event row is inserted.
type SuggestionWithAttachments = {
  event: NewGardenEvent;
  locationId: number | null;
  plantingId: number | null;
};

const DEFAULT_ZONE = 2;
const DIRECT_SOW_DEFAULT_DAYS = 45;
const MAX_OVERDUE_DAYS = 30;
// NULL dismissedAt rows are treated as permanent (never expires) for safety:
// legacy dismissals from before this column existed should not resurface crops
// the user explicitly dismissed. Only rows with a dismissedAt set AND within
// this window are expired.
const DISMISSAL_EXPIRY_DAYS = 90;

// Degrees Celsius that a fiberduk (frost fleece) adds on cold nights.
// Used in the STRETCH classification: a candidate is STRETCH if it only
// survives with the user deploying fiberduk when frost threatens.
// Source: Eliot Coleman "The Winter Harvest Handbook" + empirical grower data.
const FIBERDUK_BONUS_C = 2;

type FrostTier = 'safe' | 'stretch' | 'impossible';

type ClassifyAtDateResult = {
  tier: FrostTier;
  needsFiberduk: boolean;
};

/**
 * Classify the frost safety of placing a crop at a given date for a given zone.
 *
 * @param date - The calendar date to evaluate (sow or harvest)
 * @param cropMinTempC - Minimum survivable temperature for the crop (°C)
 * @param frostBufferC - Location's permanent protection buffer (°C)
 * @param zone - Swedish growing zone (1–8)
 */
export function classifyAtDate(
  date: Date,
  cropMinTempC: number,
  frostBufferC: number,
  zone: number,
): ClassifyAtDateResult {
  const expectedMin = getExpectedMinTempC(zone, date);
  const withLocation = expectedMin + frostBufferC;

  if (withLocation >= cropMinTempC) {
    return { tier: 'safe', needsFiberduk: false };
  }
  if (withLocation + FIBERDUK_BONUS_C >= cropMinTempC) {
    return { tier: 'stretch', needsFiberduk: true };
  }
  return { tier: 'impossible', needsFiberduk: false };
}

type ClassifyFrostTierResult = {
  tier: FrostTier;
  advice?: string;
};

const TIER_ORDER: Record<FrostTier, number> = { safe: 0, stretch: 1, impossible: 2 };

/**
 * Classify the frost tier for a crop across both sow and harvest dates.
 * Returns the worse of the two tiers. When STRETCH, includes an i18n key
 * for the advice text (rendered in Phase 3 UI).
 */
export function classifyFrostTier(
  cropMinTempC: number,
  frostBufferC: number,
  zone: number,
  sowDate: Date,
  harvestDate: Date,
): ClassifyFrostTierResult {
  const sowResult = classifyAtDate(sowDate, cropMinTempC, frostBufferC, zone);
  const harvestResult = classifyAtDate(harvestDate, cropMinTempC, frostBufferC, zone);
  const tier =
    TIER_ORDER[sowResult.tier] >= TIER_ORDER[harvestResult.tier]
      ? sowResult.tier
      : harvestResult.tier;

  if (tier === 'stretch') {
    return { tier, advice: 'frostGate.advice.requiresFiberduk' };
  }
  return { tier };
}

export interface CropOption {
  suggestionId: number;
  cropId: number;
  cropName: string;
  cropFamily: string;
  sowDate: string;
  sowMethod: 'indoor' | 'direct' | 'transplant';
  estimatedYieldKg: number;
  daysToMaturity: number | null;
  reason: string;
  sourceSeedlingId?: number;
  sourceSeedlingPlantedDate?: string;
}

export interface BedNudgeCandidate {
  suggestionId: number;
  cropId: number;
  cropName: string;
  daysToMaturity: number | null;
  sowDate: string;
  sowMethod: 'indoor' | 'direct' | 'transplant';
  reason: string;
}

export interface BedNudge {
  locationId: number;
  locationName: string;
  areaM2: number;
  type: 'empty' | 'succession';
  // When the bed becomes free. null for empty beds (already free), ISO date
  // for succession beds (date of the active planting's expected harvest).
  bedFreesUp: string | null;
  recentlyHarvested: boolean;
  lastHarvestDate: string | null;
  candidates: BedNudgeCandidate[];
}

export interface BedNudgesResult {
  daysUntilFrost: number;
  beds: BedNudge[];
}

export interface BedSuggestion {
  locationId: number;
  locationName: string;
  areaM2: number;
  type: 'empty_bed' | 'succession';
  bedFreesUp: string | null;
  currentCropName: string | null;
  crops: CropOption[];
}

export interface MaxedOutHint {
  family: string;
  wishlistCount: number;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type WishlistedCrop = {
  cropId: number;
  cropName: string;
  weeksToTransplant: number | null;
  directSowOnly: boolean;
  daysToMaturityFromTransplant: number | null;
};

type ExtendedWishlistedCrop = WishlistedCrop & {
  cropFamily: string;
  isPerennial: boolean;
  yieldKgPerM2: number;
  kcalPerKg: number;
  proteinGPerKg: number;
  carbsGPerKg: number;
  fatGPerKg: number;
  kgPerWeek: number | null;
  kgPerYear: number | null;
  indoorSowMonthStart: number | null;
  indoorSowMonthEnd: number | null;
  directSowMonthStart: number | null;
  directSowMonthEnd: number | null;
  minTempC: number;
};

// Annual kg demand combining weekly and yearly inputs. The two coexist so
// users can model both staples (eat-as-grown) and preservation crops
// (vitlök, winter squash) without forcing one rhythm onto the other.
export function getAnnualDemandKg(c: {
  kgPerWeek: number | null;
  kgPerYear: number | null;
}): number {
  return (c.kgPerWeek ?? 0) * 52 + (c.kgPerYear ?? 0);
}

type BedLocation = {
  locationId: number;
  locationName: string;
  areaM2: number;
  frostBufferC: number;
};

type ActiveBedPlanting = {
  plantingId: number;
  cropId: number;
  cropName: string;
  expectedHarvestDate: string | null;
  cropIsPerennial: boolean;
};

// How much the demand-gap "coverage %" score gets nudged by a companion
// relationship. Lower coverage = higher rank priority, so a good companion
// SUBTRACTS to surface candidates faster, a bad one ADDS to push them down.
const COMPANION_GOOD_DELTA = -15;
const COMPANION_BAD_DELTA = 25;

// Rotation score adjustments — magnitudes match companion deltas for
// consistent score semantics across both signal types.
// Legume bonus tier values are encoded in the family_rotation_bonus table:
//   top-tier N-demand successors (Brassicaceae, Solanaceae) → bonusScore = -15 (= COMPANION_GOOD_DELTA)
//   moderate N-demand successors (Cucurbitaceae, Poaceae, Chenopodiaceae, Asteraceae) → bonusScore = -10
//   autotoxicity / legume-fatigue (Fabaceae→Fabaceae) → bonusScore = +15
// The service reads bonusScore from the DB directly; constants below document the intent.
const ROTATION_SOFT_PENALTY = 25; // matches COMPANION_BAD_DELTA

type RotationAdviceKey =
  'rotation.advice.legumeBonus' | 'rotation.advice.hardExclusion' | 'rotation.advice.softPenalty';

type RotationStatus = {
  allowed: boolean;
  penalty: number;
  bonus: number;
  advice?: RotationAdviceKey;
};

type CompanionAdjustments = {
  goodNeighborForCandidate: Map<number, string>;
  badForCandidate: Set<number>;
};

type CropCoverage = {
  storageKg: number;
  expectedYieldKg: number;
};

type ActivePlanting = {
  plantingId: number;
  locationId: number;
  locationName: string;
  expectedHarvestDate: string;
};

type IndoorSeedling = {
  plantingId: number;
  cropId: number;
  plantedDate: string;
  areaM2: number;
};

type BedCandidate = {
  crop: ExtendedWishlistedCrop;
  sowDate: string;
  sowMethod: 'indoor' | 'direct' | 'transplant';
  sourceSeedlingId?: number;
  sourceSeedlingPlantedDate?: string;
  advice?: string;
  rotationPenalty: number;
  rotationBonus: number;
  rotationAdvice?: string;
};

type RankedBedCandidate = BedCandidate & { reason: string };

type EmptyLocation = {
  locationId: number;
  locationName: string;
};

export class SuggestionService {
  constructor(private readonly db: DB) {}

  async generateSuccessionSuggestions(
    householdId: number,
    today: Date = new Date(),
  ): Promise<GardenEvent[]> {
    const zone = await this.getGrowingZone(householdId);
    const activePlantings = await this.getActivePlantings(householdId);
    const emptyLocations = await this.getEmptyLocations(householdId);
    const wishlist = await this.getWishlistedCrops(householdId);

    await this.deleteExistingSuggestions(householdId);

    if (wishlist.length === 0) return [];

    const paired: SuggestionWithAttachments[] = [
      ...this.buildSuccessionSuggestions(householdId, activePlantings, wishlist, zone, today),
      ...this.buildEmptyBedSuggestions(householdId, emptyLocations, wishlist, zone, today),
    ];

    if (paired.length === 0) return [];

    const inserted = this.db
      .insert(gardenEvent)
      .values(paired.map((p) => p.event))
      .returning()
      .all();

    // Write junction rows for each inserted event.
    for (let i = 0; i < inserted.length; i++) {
      const row = inserted[i]!;
      const { locationId, plantingId } = paired[i]!;
      if (locationId !== null) {
        this.db.insert(gardenEventLocation).values({ eventId: row.id, locationId }).run();
      }
      if (plantingId !== null) {
        this.db.insert(gardenEventPlanting).values({ eventId: row.id, plantingId }).run();
      }
    }

    return inserted;
  }

  private async getGrowingZone(householdId: number): Promise<number> {
    const rows = await this.db
      .select({ growingZone: household.growingZone })
      .from(household)
      .where(eq(household.id, householdId));
    return rows[0]?.growingZone ?? DEFAULT_ZONE;
  }

  private async getActivePlantings(householdId: number): Promise<ActivePlanting[]> {
    const rows = this.db
      .select({
        plantingId: planting.id,
        locationId: planting.locationId,
        locationName: growingLocation.name,
        expectedHarvestDate: planting.expectedHarvestDate,
      })
      .from(planting)
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          inArray(planting.status, ['planted', 'growing']),
          isNotNull(planting.expectedHarvestDate),
        ),
      )
      .all();

    return rows.filter((r) => r.expectedHarvestDate !== null) as ActivePlanting[];
  }

  private async getEmptyLocations(householdId: number): Promise<EmptyLocation[]> {
    // A location is empty if it has zero plantings with an active status
    const occupiedRows = this.db
      .select({ locationId: planting.locationId })
      .from(planting)
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          inArray(planting.status, ['planted', 'growing', 'seedling']),
        ),
      )
      .all();

    const occupiedIds = new Set(occupiedRows.map((r) => r.locationId));

    const allLocations = this.db
      .select({ locationId: growingLocation.id, locationName: growingLocation.name })
      .from(growingLocation)
      .where(eq(growingLocation.householdId, householdId))
      .all();

    return allLocations.filter((l) => !occupiedIds.has(l.locationId));
  }

  private async getWishlistedCrops(householdId: number): Promise<WishlistedCrop[]> {
    return this.db
      .select({
        cropId: crop.id,
        cropName: crop.name,
        weeksToTransplant: crop.weeksToTransplant,
        directSowOnly: crop.directSowOnly,
        daysToMaturityFromTransplant: crop.daysToMaturityFromTransplant,
      })
      .from(householdCropWishlist)
      .innerJoin(crop, eq(householdCropWishlist.cropId, crop.id))
      .where(eq(householdCropWishlist.householdId, householdId));
  }

  private async deleteExistingSuggestions(householdId: number): Promise<void> {
    this.db
      .delete(gardenEvent)
      .where(and(eq(gardenEvent.householdId, householdId), eq(gardenEvent.status, 'suggestion')))
      .run();
  }

  private buildSuccessionSuggestions(
    householdId: number,
    plantings: ActivePlanting[],
    wishlist: WishlistedCrop[],
    zone: number,
    today: Date,
  ): SuggestionWithAttachments[] {
    const cutoff = addDays(today, -MAX_OVERDUE_DAYS);
    const suggestions: SuggestionWithAttachments[] = [];

    for (const p of plantings) {
      const bedFreeDate = new Date(p.expectedHarvestDate);
      const year = bedFreeDate.getFullYear();
      const firstFrost = getFirstFrostDate(zone, year);

      for (const c of wishlist) {
        const suggestion = this.buildSuccessionSuggestion(
          householdId,
          p,
          c,
          bedFreeDate,
          firstFrost,
          cutoff,
        );
        if (suggestion) suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  private buildEmptyBedSuggestions(
    householdId: number,
    locations: EmptyLocation[],
    wishlist: WishlistedCrop[],
    zone: number,
    today: Date,
  ): SuggestionWithAttachments[] {
    const firstFrost = getFirstFrostDate(zone, today.getFullYear());
    const suggestions: SuggestionWithAttachments[] = [];

    for (const loc of locations) {
      for (const c of wishlist) {
        const suggestion = this.buildEmptyBedSuggestion(householdId, loc, c, today, firstFrost);
        if (suggestion) suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  private buildSuccessionSuggestion(
    householdId: number,
    p: ActivePlanting,
    c: WishlistedCrop,
    bedFreeDate: Date,
    firstFrost: Date,
    cutoff: Date,
  ): SuggestionWithAttachments | null {
    const daysToMaturity = c.daysToMaturityFromTransplant ?? DIRECT_SOW_DEFAULT_DAYS;
    const harvestReadyDate = addDays(bedFreeDate, daysToMaturity);

    if (harvestReadyDate > firstFrost) return null;

    if (c.directSowOnly) {
      const sowDate = bedFreeDate;
      if (sowDate < cutoff) return null;
      return this.makeSuccessionSuggestion(householdId, p, c, sowDate, 'direct');
    }

    const weeksToTransplant = c.weeksToTransplant ?? 0;
    if (weeksToTransplant <= 0) return null;

    const sowDate = addDays(bedFreeDate, -(weeksToTransplant * 7));
    if (sowDate < cutoff) return null;

    return this.makeSuccessionSuggestion(householdId, p, c, sowDate, 'transplant');
  }

  private buildEmptyBedSuggestion(
    householdId: number,
    loc: EmptyLocation,
    c: WishlistedCrop,
    today: Date,
    firstFrost: Date,
  ): SuggestionWithAttachments | null {
    const daysToMaturity = c.daysToMaturityFromTransplant ?? DIRECT_SOW_DEFAULT_DAYS;
    const harvestReadyDate = addDays(today, daysToMaturity);

    if (harvestReadyDate > firstFrost) return null;

    return {
      event: {
        householdId,
        title: `Plantera ${c.cropName} i ${loc.locationName}`,
        date: toIsoDate(today),
        cropId: c.cropId,
        suggestionType: 'empty_bed',
        status: 'suggestion',
      },
      locationId: loc.locationId,
      plantingId: null,
    };
  }

  private makeSuccessionSuggestion(
    householdId: number,
    p: ActivePlanting,
    c: WishlistedCrop,
    sowDate: Date,
    type: 'transplant' | 'direct',
  ): SuggestionWithAttachments {
    const title =
      type === 'transplant'
        ? `Starta ${c.cropName} för ${p.locationName}`
        : `Direktså ${c.cropName} i ${p.locationName}`;

    return {
      event: {
        householdId,
        title,
        date: toIsoDate(sowDate),
        cropId: c.cropId,
        suggestionType: 'succession',
        status: 'suggestion',
      },
      locationId: p.locationId,
      plantingId: p.plantingId,
    };
  }

  // ---------------------------------------------------------------------------
  // generateBedSuggestions — bed-centric suggestions
  // ---------------------------------------------------------------------------

  async generateBedSuggestions(
    householdId: number,
    today: Date = new Date(),
  ): Promise<{ suggestions: BedSuggestion[]; maxedOutFamilies: MaxedOutHint[] }> {
    const zone = await this.getGrowingZone(householdId);
    const firstFrost = getFirstFrostDate(zone, today.getFullYear());
    const lastFrost = getLastFrostDate(zone, today.getFullYear());
    const outdoorLocations = this.getOutdoorLocations(householdId);
    const annualWishlist = this.getExtendedWishlistedCrops(householdId).filter(
      (c) => !c.isPerennial,
    );

    await this.deleteExistingSuggestions(householdId);

    const ctx = {
      householdId,
      today,
      zone,
      firstFrost,
      lastFrost,
      dismissed: this.getDismissedPairs(householdId),
      cropCoverages: this.getCropCoverages(householdId),
      seedlings: this.getIndoorSeedlings(householdId),
    };

    const suggestions = outdoorLocations
      .map((loc) => this.buildBedSuggestion(loc, annualWishlist, ctx))
      .filter((s): s is BedSuggestion => s !== null);

    const maxedOutFamilies = await this.getMaxedOutFamilyHints(householdId, today);

    return { suggestions, maxedOutFamilies };
  }

  private buildBedSuggestion(
    loc: BedLocation,
    annualWishlist: ExtendedWishlistedCrop[],
    ctx: {
      householdId: number;
      today: Date;
      zone: number;
      firstFrost: Date;
      lastFrost: Date;
      dismissed: Set<string>;
      cropCoverages: Map<number, CropCoverage>;
      seedlings: IndoorSeedling[];
    },
  ): BedSuggestion | null {
    const activePlantings = this.getActivePlantingsForBed(loc.locationId);
    if (this.bedHasActivePerennial(activePlantings)) return null;

    const bedType = this.classifyBed(activePlantings);
    if (bedType === null) return null;

    const bedFreesUp = this.getBedFreesUp(activePlantings, bedType);
    const currentCropName = this.getCurrentCropName(activePlantings, bedType);

    const sowCandidates = this.buildBedCandidates(
      annualWishlist,
      loc,
      bedType,
      bedFreesUp,
      ctx.firstFrost,
      ctx.today,
      ctx.zone,
      ctx.dismissed,
    );
    const transplantCandidates = this.buildSeedlingTransplantCandidates(
      ctx.seedlings,
      annualWishlist,
      loc,
      bedType,
      bedFreesUp,
      ctx.firstFrost,
      ctx.lastFrost,
      ctx.today,
      ctx.zone,
      ctx.dismissed,
    );
    const candidates = [...sowCandidates, ...transplantCandidates];
    const companionAdj = this.getCompanionAdjustments(activePlantings);
    const rankedCandidates = this.rankByCropDemandGap(candidates, ctx.cropCoverages, companionAdj);
    const crops = this.insertBedCandidates(ctx.householdId, loc, bedType, rankedCandidates);

    return {
      locationId: loc.locationId,
      locationName: loc.locationName,
      areaM2: loc.areaM2,
      type: bedType,
      bedFreesUp,
      currentCropName,
      crops,
    };
  }

  private getIndoorSeedlings(householdId: number): IndoorSeedling[] {
    return this.db
      .select({
        plantingId: planting.id,
        cropId: planting.cropId,
        plantedDate: planting.plantedDate,
        areaM2: planting.areaM2,
      })
      .from(planting)
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          eq(growingLocation.isIndoor, true),
          eq(planting.status, 'seedling'),
        ),
      )
      .all();
  }

  private buildSeedlingTransplantCandidates(
    seedlings: IndoorSeedling[],
    wishlist: ExtendedWishlistedCrop[],
    loc: BedLocation,
    bedType: 'empty_bed' | 'succession',
    bedFreesUp: string | null,
    firstFrost: Date,
    lastFrost: Date,
    today: Date,
    zone: number,
    dismissed: Set<string>,
  ): BedCandidate[] {
    const bedFreeDate = bedType === 'succession' && bedFreesUp ? new Date(bedFreesUp) : today;
    // Normalize lastFrost to UTC midnight so toIsoDate is timezone-stable when
    // it's the winning value of the readyToTransplant max().
    const lastFrostUtc = new Date(
      Date.UTC(lastFrost.getFullYear(), lastFrost.getMonth(), lastFrost.getDate()),
    );
    return seedlings.flatMap((s) =>
      this.evalSeedlingCandidate(
        s,
        wishlist,
        loc,
        bedFreeDate,
        lastFrostUtc,
        firstFrost,
        zone,
        dismissed,
      ),
    );
  }

  private evalSeedlingCandidate(
    s: IndoorSeedling,
    wishlist: ExtendedWishlistedCrop[],
    loc: BedLocation,
    bedFreeDate: Date,
    lastFrostUtc: Date,
    firstFrost: Date,
    zone: number,
    dismissed: Set<string>,
  ): BedCandidate[] {
    const cropInfo = wishlist.find((c) => c.cropId === s.cropId);
    if (!cropInfo) return [];
    if (dismissed.has(`${loc.locationId}:${s.cropId}`)) return [];

    const weeksToTransplant = cropInfo.weeksToTransplant ?? 0;
    if (weeksToTransplant <= 0) return [];

    const biologyReady = addDays(new Date(s.plantedDate), weeksToTransplant * 7);
    const readyToTransplant = new Date(
      Math.max(biologyReady.getTime(), lastFrostUtc.getTime(), bedFreeDate.getTime()),
    );

    const rotationStatus = this.getRotationStatus(
      loc.locationId,
      cropInfo.cropFamily,
      readyToTransplant,
    );
    if (!rotationStatus.allowed) return [];

    const daysToMaturity = cropInfo.daysToMaturityFromTransplant ?? DIRECT_SOW_DEFAULT_DAYS;
    const harvestReady = addDays(readyToTransplant, daysToMaturity);
    const gate = this.applyFrostGate(
      cropInfo.minTempC,
      loc.frostBufferC,
      zone,
      readyToTransplant,
      harvestReady,
      firstFrost,
    );
    if (!gate.pass) return [];

    return [
      {
        crop: cropInfo,
        sowDate: toIsoDate(readyToTransplant),
        sowMethod: 'transplant',
        sourceSeedlingId: s.plantingId,
        sourceSeedlingPlantedDate: s.plantedDate,
        advice: gate.advice,
        rotationPenalty: rotationStatus.penalty,
        rotationBonus: rotationStatus.bonus,
        rotationAdvice: rotationStatus.advice,
      },
    ];
  }

  private getOutdoorLocations(householdId: number): BedLocation[] {
    return this.db
      .select({
        locationId: growingLocation.id,
        locationName: growingLocation.name,
        areaM2: growingLocation.areaM2,
        frostBufferC: growingLocation.frostBufferC,
      })
      .from(growingLocation)
      .where(and(eq(growingLocation.householdId, householdId), eq(growingLocation.isIndoor, false)))
      .all();
  }

  private getExtendedWishlistedCrops(householdId: number): ExtendedWishlistedCrop[] {
    // Legacy both-null rows (from before demand validation) are excluded
    // from suggestions — the wishlist UI surfaces them with a "set demand
    // to rank this" badge so the data gap is visible rather than silently
    // ranked at the top with zero coverage.
    return this.db
      .select({
        cropId: crop.id,
        cropName: crop.name,
        weeksToTransplant: crop.weeksToTransplant,
        directSowOnly: crop.directSowOnly,
        daysToMaturityFromTransplant: crop.daysToMaturityFromTransplant,
        cropFamily: crop.cropFamily,
        isPerennial: crop.isPerennial,
        yieldKgPerM2: crop.yieldKgPerM2,
        kcalPerKg: crop.kcalPerKg,
        proteinGPerKg: crop.proteinGPerKg,
        carbsGPerKg: crop.carbsGPerKg,
        fatGPerKg: crop.fatGPerKg,
        kgPerWeek: householdCropWishlist.kgPerWeek,
        kgPerYear: householdCropWishlist.kgPerYear,
        indoorSowMonthStart: crop.indoorSowMonthStart,
        indoorSowMonthEnd: crop.indoorSowMonthEnd,
        directSowMonthStart: crop.directSowMonthStart,
        directSowMonthEnd: crop.directSowMonthEnd,
        minTempC: crop.minTempC,
      })
      .from(householdCropWishlist)
      .innerJoin(crop, eq(householdCropWishlist.cropId, crop.id))
      .where(
        and(
          eq(householdCropWishlist.householdId, householdId),
          or(
            isNotNull(householdCropWishlist.kgPerWeek),
            isNotNull(householdCropWishlist.kgPerYear),
          ),
        ),
      )
      .all();
  }

  private getActivePlantingsForBed(locationId: number): ActiveBedPlanting[] {
    return this.db
      .select({
        plantingId: planting.id,
        cropId: crop.id,
        cropName: crop.name,
        expectedHarvestDate: planting.expectedHarvestDate,
        cropIsPerennial: crop.isPerennial,
      })
      .from(planting)
      .innerJoin(crop, eq(planting.cropId, crop.id))
      .where(
        and(
          eq(planting.locationId, locationId),
          inArray(planting.status, ['planted', 'growing', 'seedling']),
        ),
      )
      .all();
  }

  // For each candidate crop, compute whether it's a good or bad companion of
  // anything currently growing in the bed. Returns lookup structures keyed by
  // candidate crop id so the ranking step can apply deltas in O(1).
  private getCompanionAdjustments(neighbors: ActiveBedPlanting[]): CompanionAdjustments {
    const adj: CompanionAdjustments = {
      goodNeighborForCandidate: new Map(),
      badForCandidate: new Set(),
    };
    if (neighbors.length === 0) return adj;

    const neighborIds = neighbors.map((n) => n.cropId);
    const neighborNameById = new Map(neighbors.map((n) => [n.cropId, n.cropName]));

    const rows = this.db
      .select()
      .from(companionPlanting)
      .where(
        or(
          inArray(companionPlanting.cropAId, neighborIds),
          inArray(companionPlanting.cropBId, neighborIds),
        ),
      )
      .all();

    for (const row of rows) {
      const aIsNeighbor = neighborNameById.has(row.cropAId);
      const bIsNeighbor = neighborNameById.has(row.cropBId);
      // If both ends are neighbours, there's no candidate side; skip.
      if (aIsNeighbor && bIsNeighbor) continue;
      const neighborId = aIsNeighbor ? row.cropAId : row.cropBId;
      const candidateId = aIsNeighbor ? row.cropBId : row.cropAId;

      if (row.relationship === 'good') {
        // First-good-neighbour-wins for the reason text; users only see one.
        if (!adj.goodNeighborForCandidate.has(candidateId)) {
          adj.goodNeighborForCandidate.set(candidateId, neighborNameById.get(neighborId)!);
        }
      } else if (row.relationship === 'bad') {
        adj.badForCandidate.add(candidateId);
      }
    }
    return adj;
  }

  private bedHasActivePerennial(plantings: ActiveBedPlanting[]): boolean {
    return plantings.some((p) => p.cropIsPerennial);
  }

  private classifyBed(activePlantings: ActiveBedPlanting[]): 'empty_bed' | 'succession' | null {
    if (activePlantings.length === 0) return 'empty_bed';

    const hasHarvestDate = activePlantings.some((p) => p.expectedHarvestDate !== null);
    if (hasHarvestDate) return 'succession';

    return null;
  }

  private getBedFreesUp(
    activePlantings: ActiveBedPlanting[],
    bedType: 'empty_bed' | 'succession',
  ): string | null {
    if (bedType === 'empty_bed') return null;
    const withDate = activePlantings.find((p) => p.expectedHarvestDate !== null);
    return withDate?.expectedHarvestDate ?? null;
  }

  private getCurrentCropName(
    activePlantings: ActiveBedPlanting[],
    bedType: 'empty_bed' | 'succession',
  ): string | null {
    if (bedType === 'empty_bed') return null;
    const withDate = activePlantings.find((p) => p.expectedHarvestDate !== null);
    return withDate?.cropName ?? null;
  }

  /**
   * Determine whether a candidate crop family is allowed in a bed and what
   * score adjustments apply, based on past plantings and the rotation rules.
   *
   * Uses `today` throughout — never calls Date.now() or new Date() internally.
   *
   * Precedence rules:
   * 1. Hard exclusion short-circuits everything (allowed=false, penalty=0, bonus=0).
   * 2. Soft penalty and legume bonus are additive — both may apply simultaneously.
   * 3. When bonus and soft penalty coexist, advice key = legumeBonus (more
   *    specific and actionable signal; test I locks this).
   * 4. The boundary is strictly: plantedDate >= cutoff (cutoff = today - N*365 days).
   *    A planting ON the cutoff date IS inside the window (test C/E locks this).
   */
  private getRotationStatus(
    locationId: number,
    candidateFamily: string,
    today: Date,
  ): RotationStatus {
    // 1. Look up the rotation rule for this family (case-insensitive match —
    //    seed data uses Title-case, crop.cropFamily may be lowercase).
    const familyLower = candidateFamily.toLowerCase();
    const rules = this.db
      .select()
      .from(cropFamilyRotation)
      .where(sql`lower(${cropFamilyRotation.family}) = ${familyLower}`)
      .all();
    const rule = rules[0] ?? null;

    // No rule → no restriction
    if (rule === null) {
      return { allowed: true, penalty: 0, bonus: 0 };
    }

    // 2. Fetch all past plantings for this location joined to crop family
    const pastPlantings = this.db
      .select({ plantedDate: planting.plantedDate, cropFamily: crop.cropFamily })
      .from(planting)
      .innerJoin(crop, eq(planting.cropId, crop.id))
      .where(eq(planting.locationId, locationId))
      .all();

    // 3. Hard exclusion check
    if (rule.exclusionYears > 0) {
      const cutoff = addDays(today, -(rule.exclusionYears * 365));
      const cutoffStr = toIsoDate(cutoff);
      const insideWindow = pastPlantings.some(
        (p) =>
          p.cropFamily.toLowerCase() === candidateFamily.toLowerCase() &&
          p.plantedDate >= cutoffStr,
      );
      if (insideWindow) {
        return {
          allowed: false,
          penalty: 0,
          bonus: 0,
          advice: 'rotation.advice.hardExclusion',
        };
      }
    }

    let penalty = 0;
    let bonus = 0;
    let advice: RotationAdviceKey | undefined;

    // 4. Soft penalty check
    if (rule.penaltyYears > 0) {
      const cutoff = addDays(today, -(rule.penaltyYears * 365));
      const cutoffStr = toIsoDate(cutoff);
      const insideWindow = pastPlantings.some(
        (p) =>
          p.cropFamily.toLowerCase() === candidateFamily.toLowerCase() &&
          p.plantedDate >= cutoffStr,
      );
      if (insideWindow) {
        penalty = ROTATION_SOFT_PENALTY;
        advice = 'rotation.advice.softPenalty';
      }
    }

    // 5. Legume bonus check — rolling 365-day lookback from `today`
    const bonusCutoff = addDays(today, -365);
    const bonusCutoffStr = toIsoDate(bonusCutoff);
    const hasFabaceaePredecessor = pastPlantings.some(
      (p) => p.cropFamily.toLowerCase() === 'fabaceae' && p.plantedDate >= bonusCutoffStr,
    );

    if (hasFabaceaePredecessor) {
      const bonusRows = this.db
        .select({ bonusScore: familyRotationBonus.bonusScore })
        .from(familyRotationBonus)
        .where(
          and(
            sql`lower(${familyRotationBonus.predecessorFamily}) = 'fabaceae'`,
            sql`lower(${familyRotationBonus.successorFamily}) = ${familyLower}`,
          ),
        )
        .all();
      const bonusRow = bonusRows[0] ?? null;
      if (bonusRow !== null) {
        bonus = bonusRow.bonusScore;
        advice = 'rotation.advice.legumeBonus';
      }
    }

    return { allowed: true, penalty, bonus, ...(advice ? { advice } : {}) };
  }

  private getDismissedPairs(householdId: number): Set<string> {
    const cutoff = new Date(Date.now() - DISMISSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // Include dismissals that are either permanent (NULL dismissedAt = legacy rows)
    // or within the 90-day expiry window (dismissedAt >= cutoff).
    // Rows with a dismissedAt older than 90 days are excluded — the suggestion reappears.
    const rows = this.db
      .select({ locationId: gardenEventLocation.locationId, cropId: gardenEvent.cropId })
      .from(gardenEvent)
      .innerJoin(gardenEventLocation, eq(gardenEventLocation.eventId, gardenEvent.id))
      .where(
        and(
          eq(gardenEvent.householdId, householdId),
          eq(gardenEvent.status, 'dismissed'),
          or(isNull(gardenEvent.dismissedAt), gte(gardenEvent.dismissedAt, cutoff)),
        ),
      )
      .all();
    const pairs = new Set<string>();
    for (const r of rows) {
      if (r.cropId !== null) {
        pairs.add(`${r.locationId}:${r.cropId}`);
      }
    }
    return pairs;
  }

  async clearDismissals(householdId: number): Promise<{ cleared: number }> {
    const result = this.db
      .update(gardenEvent)
      .set({ status: 'completed' })
      .where(and(eq(gardenEvent.householdId, householdId), eq(gardenEvent.status, 'dismissed')))
      .returning()
      .all();
    return { cleared: result.length };
  }

  private getCropCoverages(householdId: number): Map<number, CropCoverage> {
    const coverages = new Map<number, CropCoverage>();

    // Storage: sum quantityKg by cropId
    const storageRows = this.db
      .select({ cropId: storageItem.cropId, quantityKg: storageItem.quantityKg })
      .from(storageItem)
      .where(eq(storageItem.householdId, householdId))
      .all();

    for (const row of storageRows) {
      const existing = coverages.get(row.cropId) ?? { storageKg: 0, expectedYieldKg: 0 };
      existing.storageKg += row.quantityKg;
      coverages.set(row.cropId, existing);
    }

    // Active plantings: sum expected yield (areaM2 × yieldKgPerM2) by cropId
    const plantingRows = this.db
      .select({
        cropId: planting.cropId,
        areaM2: planting.areaM2,
        yieldKgPerM2: crop.yieldKgPerM2,
      })
      .from(planting)
      .innerJoin(crop, eq(planting.cropId, crop.id))
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          inArray(planting.status, ['planted', 'growing', 'seedling']),
        ),
      )
      .all();

    for (const row of plantingRows) {
      const existing = coverages.get(row.cropId) ?? { storageKg: 0, expectedYieldKg: 0 };
      existing.expectedYieldKg += row.areaM2 * row.yieldKgPerM2;
      coverages.set(row.cropId, existing);
    }

    return coverages;
  }

  private isSowWindowOpen(c: ExtendedWishlistedCrop, sowMonth: number): boolean {
    if (c.directSowOnly) {
      if (c.directSowMonthStart === null || c.directSowMonthEnd === null) return true;
      return sowMonth >= c.directSowMonthStart && sowMonth <= c.directSowMonthEnd;
    }
    if (c.indoorSowMonthStart === null || c.indoorSowMonthEnd === null) return true;
    return sowMonth >= c.indoorSowMonthStart && sowMonth <= c.indoorSowMonthEnd;
  }

  private calcSowDate(
    c: ExtendedWishlistedCrop,
    bedFreeDate: Date,
    bedType: 'empty_bed' | 'succession',
  ): { sowDate: Date; sowMethod: 'indoor' | 'direct' } | null {
    if (c.directSowOnly) {
      return { sowDate: bedFreeDate, sowMethod: 'direct' };
    }
    const weeksToTransplant = c.weeksToTransplant ?? 0;
    if (weeksToTransplant <= 0) return null;

    if (bedType === 'empty_bed') {
      // Bed is free now — sow indoors today, transplant later
      return { sowDate: bedFreeDate, sowMethod: 'indoor' };
    }

    // Succession: need transplants ready when bed frees up
    return {
      sowDate: addDays(bedFreeDate, -(weeksToTransplant * 7)),
      sowMethod: 'indoor',
    };
  }

  /**
   * Apply the frost gate for a candidate crop at a given sow/harvest pair.
   * Returns `{ pass: false }` when the crop should be dropped, or
   * `{ pass: true, advice? }` when the crop should be kept (advice present
   * only for STRETCH candidates).
   *
   * Default crops (minTempC=0, frostBufferC=0) use the legacy binary gate
   * so that existing tests remain green with default seed data.
   * Hardy crops (minTempC<0) or protected locations (frostBufferC>0) use
   * the temperature-based classifier.
   */
  private applyFrostGate(
    minTempC: number,
    frostBufferC: number,
    zone: number,
    sowDate: Date,
    harvestDate: Date,
    firstFrost: Date,
  ): { pass: boolean; advice?: string } {
    if (minTempC === 0 && frostBufferC === 0) {
      return { pass: harvestDate <= firstFrost };
    }
    const frostResult = classifyFrostTier(minTempC, frostBufferC, zone, sowDate, harvestDate);
    if (frostResult.tier === 'impossible') return { pass: false };
    return { pass: true, advice: frostResult.advice };
  }

  private buildBedCandidates(
    wishlist: ExtendedWishlistedCrop[],
    loc: BedLocation,
    bedType: 'empty_bed' | 'succession',
    bedFreesUp: string | null,
    firstFrost: Date,
    today: Date,
    zone: number,
    dismissed: Set<string>,
  ): BedCandidate[] {
    const bedFreeDate = bedType === 'succession' && bedFreesUp ? new Date(bedFreesUp) : today;
    return wishlist.flatMap((c) =>
      this.evalBedCandidate(c, loc, bedType, bedFreeDate, firstFrost, zone, dismissed),
    );
  }

  private evalBedCandidate(
    c: ExtendedWishlistedCrop,
    loc: BedLocation,
    bedType: 'empty_bed' | 'succession',
    bedFreeDate: Date,
    firstFrost: Date,
    zone: number,
    dismissed: Set<string>,
  ): BedCandidate[] {
    if (dismissed.has(`${loc.locationId}:${c.cropId}`)) return [];

    const daysToMaturity = c.daysToMaturityFromTransplant ?? DIRECT_SOW_DEFAULT_DAYS;
    const transplantDelay =
      !c.directSowOnly && bedType === 'empty_bed' ? (c.weeksToTransplant ?? 0) * 7 : 0;
    const harvestReadyDate = addDays(bedFreeDate, transplantDelay + daysToMaturity);

    const sowResult = this.calcSowDate(c, bedFreeDate, bedType);
    if (!sowResult) return [];

    const rotationStatus = this.getRotationStatus(loc.locationId, c.cropFamily, sowResult.sowDate);
    if (!rotationStatus.allowed) return [];

    const gate = this.applyFrostGate(
      c.minTempC,
      loc.frostBufferC,
      zone,
      sowResult.sowDate,
      harvestReadyDate,
      firstFrost,
    );
    if (!gate.pass) return [];

    const sowMonth = sowResult.sowDate.getMonth() + 1;
    if (!this.isSowWindowOpen(c, sowMonth)) return [];

    return [
      {
        crop: c,
        sowDate: toIsoDate(sowResult.sowDate),
        sowMethod: sowResult.sowMethod,
        advice: gate.advice,
        rotationPenalty: rotationStatus.penalty,
        rotationBonus: rotationStatus.bonus,
        rotationAdvice: rotationStatus.advice,
      },
    ];
  }

  private getCoveragePct(
    c: ExtendedWishlistedCrop,
    cropCoverages: Map<number, CropCoverage>,
  ): number {
    const annualDemand = getAnnualDemandKg(c);
    if (annualDemand <= 0) return 0;
    const coverage = cropCoverages.get(c.cropId);
    const coveredKg = (coverage?.storageKg ?? 0) + (coverage?.expectedYieldKg ?? 0);
    return Math.round((coveredKg / annualDemand) * 100);
  }

  // Every candidate now has an annual demand value (validation prevents
  // both-null inserts; legacy both-null rows are filtered out upstream
  // and surfaced to the user via the "missing demand" badge instead).
  private rankByCropDemandGap(
    candidates: BedCandidate[],
    cropCoverages: Map<number, CropCoverage>,
    companionAdj: CompanionAdjustments = {
      goodNeighborForCandidate: new Map(),
      badForCandidate: new Set(),
    },
  ): RankedBedCandidate[] {
    return candidates
      .map((c) => {
        const baseCoverage = this.getCoveragePct(c.crop, cropCoverages);
        const goodNeighbor = companionAdj.goodNeighborForCandidate.get(c.crop.cropId);
        const isBad = companionAdj.badForCandidate.has(c.crop.cropId);
        const score =
          baseCoverage +
          (goodNeighbor ? COMPANION_GOOD_DELTA : 0) +
          (isBad ? COMPANION_BAD_DELTA : 0) +
          c.rotationPenalty +
          c.rotationBonus;
        return { ...c, score, baseCoverage };
      })
      .sort((a, b) => a.score - b.score)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drops `score` from the result
      .map(({ score, baseCoverage, ...rest }) => ({
        ...rest,
        reason: this.formatReason(
          `${baseCoverage}% covered`,
          rest.crop.cropId,
          companionAdj,
          rest.rotationAdvice,
          rest.advice,
        ),
      }));
  }

  private formatReason(
    base: string,
    cropId: number,
    companionAdj: CompanionAdjustments,
    rotationAdvice?: string,
    advice?: string,
  ): string {
    const goodNeighbor = companionAdj.goodNeighborForCandidate.get(cropId);
    const parts: string[] = [];
    if (goodNeighbor) parts.push(`Bra granne med ${goodNeighbor}`);
    parts.push(base);
    if (rotationAdvice) parts.push(rotationAdvice);
    if (advice) parts.push(advice);
    return parts.join(' · ');
  }

  private insertBedCandidates(
    householdId: number,
    loc: BedLocation,
    bedType: 'empty_bed' | 'succession',
    candidates: RankedBedCandidate[],
  ): CropOption[] {
    if (candidates.length === 0) return [];

    const rows: NewGardenEvent[] = candidates.map((c) => ({
      householdId,
      title: `${c.crop.cropName} i ${loc.locationName}`,
      date: c.sowDate,
      cropId: c.crop.cropId,
      suggestionType: c.sowMethod === 'transplant' ? 'transplant' : bedType,
      status: 'suggestion',
    }));

    const inserted = this.db.insert(gardenEvent).values(rows).returning().all();

    // Write junction rows for each inserted event.
    for (let i = 0; i < inserted.length; i++) {
      const row = inserted[i]!;
      const candidate = candidates[i]!;
      this.db
        .insert(gardenEventLocation)
        .values({ eventId: row.id, locationId: loc.locationId })
        .run();
      if (candidate.sourceSeedlingId !== undefined) {
        this.db
          .insert(gardenEventPlanting)
          .values({ eventId: row.id, plantingId: candidate.sourceSeedlingId })
          .run();
      }
    }

    return inserted.map((row, idx) => {
      const candidate = candidates[idx]!;
      return {
        suggestionId: row.id,
        cropId: candidate.crop.cropId,
        cropName: candidate.crop.cropName,
        cropFamily: candidate.crop.cropFamily,
        sowDate: candidate.sowDate,
        sowMethod: candidate.sowMethod,
        estimatedYieldKg: candidate.crop.yieldKgPerM2 * loc.areaM2,
        daysToMaturity: candidate.crop.daysToMaturityFromTransplant,
        reason: candidate.reason,
        sourceSeedlingId: candidate.sourceSeedlingId,
        sourceSeedlingPlantedDate: candidate.sourceSeedlingPlantedDate,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Bed nudges — proactive surfacing for the dashboard + location detail page.
  // Runs the normal suggestion engine and decorates each bed with type chip
  // (empty / succession), frost-budget (returned once at the top, identical
  // for all beds in the same household), recently-harvested flag, and top-3
  // candidates. UI renders a single "Förslag från trädgårdsmästaren" card.
  // -------------------------------------------------------------------------
  async getBedNudges(householdId: number, today: Date = new Date()): Promise<BedNudgesResult> {
    const { suggestions: beds } = await this.generateBedSuggestions(householdId, today);
    const eligible = beds.filter((b) => b.crops.length > 0);

    const zone = await this.getGrowingZone(householdId);
    const firstFrost = getFirstFrostDate(zone, today.getFullYear());
    const todayMs = today.getTime();
    const daysUntilFrost = Math.max(0, Math.round((firstFrost.getTime() - todayMs) / 86_400_000));

    if (eligible.length === 0) {
      return { daysUntilFrost, beds: [] };
    }

    // Latest harvest_event per location (any planting in that location). We
    // pull all harvests touching the household's locations in one query, then
    // pick the max per location.
    const lastHarvestByLocation = new Map<number, string>();
    const harvestRows = await this.db
      .select({
        locationId: planting.locationId,
        harvestedDate: harvestEvent.harvestedDate,
      })
      .from(harvestEvent)
      .innerJoin(planting, eq(harvestEvent.plantingId, planting.id))
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .where(eq(growingLocation.householdId, householdId));
    for (const row of harvestRows) {
      const prev = lastHarvestByLocation.get(row.locationId);
      if (!prev || row.harvestedDate > prev) {
        lastHarvestByLocation.set(row.locationId, row.harvestedDate);
      }
    }

    const RECENT_HARVEST_DAYS = 14;
    const nudges: BedNudge[] = eligible.map((b) => {
      const lastHarvestDate = lastHarvestByLocation.get(b.locationId) ?? null;
      let recentlyHarvested = false;
      if (lastHarvestDate) {
        const daysSince = Math.round((todayMs - new Date(lastHarvestDate).getTime()) / 86_400_000);
        recentlyHarvested = daysSince >= 0 && daysSince <= RECENT_HARVEST_DAYS;
      }
      return {
        locationId: b.locationId,
        locationName: b.locationName,
        areaM2: b.areaM2,
        type: b.type === 'empty_bed' ? 'empty' : 'succession',
        bedFreesUp: b.bedFreesUp,
        recentlyHarvested,
        lastHarvestDate,
        candidates: b.crops.slice(0, 3).map((c) => ({
          suggestionId: c.suggestionId,
          cropId: c.cropId,
          cropName: c.cropName,
          daysToMaturity: c.daysToMaturity,
          sowDate: c.sowDate,
          sowMethod: c.sowMethod,
          reason: c.reason,
        })),
      };
    });

    return { daysUntilFrost, beds: nudges };
  }

  // ---------------------------------------------------------------------------
  // getMaxedOutFamilyHints — Layer 7
  // Returns families that have ≥ 3 wishlist crops AND no bed in the household
  // currently allows that family via rotation rules.
  // ---------------------------------------------------------------------------
  async getMaxedOutFamilyHints(
    householdId: number,
    today: Date = new Date(),
  ): Promise<MaxedOutHint[]> {
    const wishlist = this.getExtendedWishlistedCrops(householdId);
    const beds = this.getOutdoorLocations(householdId);

    // Group wishlist by family and count
    const countByFamily = new Map<string, number>();
    for (const crop of wishlist) {
      const fam = crop.cropFamily;
      countByFamily.set(fam, (countByFamily.get(fam) ?? 0) + 1);
    }

    const hints: MaxedOutHint[] = [];

    for (const [family, count] of countByFamily) {
      if (count < 3) continue;

      // Check whether ANY bed allows this family
      const anyAllowed = beds.some(
        (bed) => this.getRotationStatus(bed.locationId, family, today).allowed,
      );

      if (!anyAllowed) {
        hints.push({ family, wishlistCount: count });
      }
    }

    return hints;
  }
}
