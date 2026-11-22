import { eq, inArray } from 'drizzle-orm';
import type { DB } from '../db/index';
import { garden, growingLocation, type Garden, type NewGarden } from '../db/schema';

export interface GardenLayout {
  cells: Record<string, number | string>;
  colors: Record<string, string>;
}

const MAX_CELLS = 100_000;

export class GardenService {
  constructor(private readonly db: DB) {}

  async create(data: Omit<NewGarden, 'layout'>): Promise<Garden> {
    this.validateDimensions(data.widthCm, data.heightCm, data.cellSizeCm ?? 10);

    const rows = this.db.insert(garden).values(data).returning().all();
    return rows[0]!;
  }

  async getByHouseholdId(householdId: number): Promise<Garden | null> {
    const rows = await this.db.select().from(garden).where(eq(garden.householdId, householdId));
    return rows[0] ?? null;
  }

  async update(id: number, data: Partial<Omit<NewGarden, 'layout'>>): Promise<Garden | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    if (
      data.widthCm !== undefined ||
      data.heightCm !== undefined ||
      data.cellSizeCm !== undefined
    ) {
      const widthCm = data.widthCm ?? existing.widthCm;
      const heightCm = data.heightCm ?? existing.heightCm;
      const cellSizeCm = data.cellSizeCm ?? existing.cellSizeCm;
      this.validateDimensions(widthCm, heightCm, cellSizeCm);
    }

    const rows = this.db
      .update(garden)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(garden.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async updateLayout(id: number, layout: GardenLayout): Promise<Garden | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const cellCount = this.getCellCount(layout);
    if (cellCount > MAX_CELLS) {
      throw new Error(`Exceeds maximum cell count of ${MAX_CELLS}`);
    }

    this.validateCellCoords(layout, existing.widthCm, existing.heightCm, existing.cellSizeCm);
    await this.validateLocationIds(layout);

    const rows = this.db
      .update(garden)
      .set({ layout: JSON.stringify(layout), updatedAt: new Date().toISOString() })
      .where(eq(garden.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db.delete(garden).where(eq(garden.id, id)).returning().all();
    return rows.length > 0;
  }

  calculatePaintedArea(layout: GardenLayout, cellSizeCm: number, locationId: number): number {
    const cellCount = Object.values(layout.cells).filter((v) => v === locationId).length;
    const cellAreaM2 = (cellSizeCm / 100) ** 2;
    return cellCount * cellAreaM2;
  }

  getCellCount(layout: GardenLayout): number {
    return Object.keys(layout.cells).length;
  }

  private async getById(id: number): Promise<Garden | null> {
    const rows = await this.db.select().from(garden).where(eq(garden.id, id));
    return rows[0] ?? null;
  }

  private validateDimensions(widthCm: number, heightCm: number, cellSizeCm: number): void {
    if (widthCm <= 0) throw new Error('widthCm must be positive');
    if (heightCm <= 0) throw new Error('heightCm must be positive');
    if (cellSizeCm < 1) throw new Error('cellSizeCm must be at least 1');

    const cols = Math.ceil(widthCm / cellSizeCm);
    const rows = Math.ceil(heightCm / cellSizeCm);
    if (cols * rows > MAX_CELLS) {
      throw new Error(
        `Exceeds maximum cell count of ${MAX_CELLS} (${cols} × ${rows} = ${cols * rows})`,
      );
    }
  }

  private validateCellCoords(
    layout: GardenLayout,
    widthCm: number,
    heightCm: number,
    cellSizeCm: number,
  ): void {
    const maxCol = Math.ceil(widthCm / cellSizeCm) - 1;
    const maxRow = Math.ceil(heightCm / cellSizeCm) - 1;

    for (const key of Object.keys(layout.cells)) {
      const [colStr, rowStr] = key.split(',');
      const col = parseInt(colStr!, 10);
      const row = parseInt(rowStr!, 10);

      if (isNaN(col) || isNaN(row) || col < 0 || row < 0 || col > maxCol || row > maxRow) {
        throw new Error(`Cell coordinate "${key}" is out of bounds (max: ${maxCol},${maxRow})`);
      }
    }
  }

  private async validateLocationIds(layout: GardenLayout): Promise<void> {
    const locationIds = [
      ...new Set(Object.values(layout.cells).filter((v): v is number => typeof v === 'number')),
    ];

    if (locationIds.length === 0) return;

    const existing = await this.db
      .select({ id: growingLocation.id })
      .from(growingLocation)
      .where(inArray(growingLocation.id, locationIds));

    const existingIds = new Set(existing.map((r) => r.id));
    const missing = locationIds.filter((id) => !existingIds.has(id));

    if (missing.length > 0) {
      throw new Error(`Referenced non-existent location IDs: ${missing.join(', ')}`);
    }
  }
}
