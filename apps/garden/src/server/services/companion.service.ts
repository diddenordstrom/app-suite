import { eq, or } from 'drizzle-orm';
import type { DB } from '../db/index';
import { companionPlanting, crop } from '../db/schema';
import type {
  CompanionEvidenceLevel,
  CompanionRelationship,
  NewCompanionPlanting,
} from '../db/schema';

export interface CompanionEntry {
  otherCropId: number;
  otherCropName: string;
  evidenceLevel: CompanionEvidenceLevel;
  source: string;
  note: string | null;
}

export interface CompanionLists {
  good: CompanionEntry[];
  bad: CompanionEntry[];
}

export interface AttachInput {
  cropAId: number;
  cropBId: number;
  relationship: CompanionRelationship;
  evidenceLevel: CompanionEvidenceLevel;
  source: string;
  note?: string | null;
}

// Normalise an unordered pair into canonical (smaller-id, larger-id) form so
// `(carrot, dill)` and `(dill, carrot)` collapse into a single row.
function canonicalPair(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

export class CompanionService {
  constructor(private readonly db: DB) {}

  async upsert(input: AttachInput): Promise<void> {
    if (input.cropAId === input.cropBId) {
      throw new Error('A crop cannot be its own companion');
    }
    const [a, b] = canonicalPair(input.cropAId, input.cropBId);
    this.db
      .insert(companionPlanting)
      .values({
        cropAId: a,
        cropBId: b,
        relationship: input.relationship,
        evidenceLevel: input.evidenceLevel,
        source: input.source,
        note: input.note ?? null,
      } satisfies NewCompanionPlanting)
      .onConflictDoNothing()
      .run();
  }

  async listForCrop(cropId: number): Promise<CompanionLists> {
    const rows = await this.db
      .select({
        cropAId: companionPlanting.cropAId,
        cropBId: companionPlanting.cropBId,
        relationship: companionPlanting.relationship,
        evidenceLevel: companionPlanting.evidenceLevel,
        source: companionPlanting.source,
        note: companionPlanting.note,
        cropAName: crop.name,
      })
      .from(companionPlanting)
      .innerJoin(crop, eq(companionPlanting.cropAId, crop.id))
      .where(or(eq(companionPlanting.cropAId, cropId), eq(companionPlanting.cropBId, cropId)));

    // We joined on cropAId; for rows where the target crop is cropBId we need
    // to fetch the cropAId's name separately (already in `cropAName`). For
    // rows where the target crop is cropAId, we need cropBId's name. Resolve
    // both directions by querying crop names in a second pass.
    const otherIds = new Set<number>();
    for (const r of rows) {
      const otherId = r.cropAId === cropId ? r.cropBId : r.cropAId;
      otherIds.add(otherId);
    }
    const nameMap = new Map<number, string>();
    if (otherIds.size > 0) {
      const cropRows = await this.db.select().from(crop);
      for (const c of cropRows) {
        if (otherIds.has(c.id)) {
          nameMap.set(c.id, c.name);
        }
      }
    }

    const good: CompanionEntry[] = [];
    const bad: CompanionEntry[] = [];
    for (const r of rows) {
      const otherId = r.cropAId === cropId ? r.cropBId : r.cropAId;
      const entry: CompanionEntry = {
        otherCropId: otherId,
        otherCropName: nameMap.get(otherId) ?? '',
        evidenceLevel: r.evidenceLevel as CompanionEvidenceLevel,
        source: r.source,
        note: r.note,
      };
      if (r.relationship === 'good') {
        good.push(entry);
      } else if (r.relationship === 'bad') {
        bad.push(entry);
      }
    }
    good.sort((a, b) => a.otherCropName.localeCompare(b.otherCropName));
    bad.sort((a, b) => a.otherCropName.localeCompare(b.otherCropName));
    return { good, bad };
  }
}
