export type PlantingMode = "area" | "count";

/**
 * Expected yield in kg (one decimal): plants × kg per plant in count mode (the planting's own figure first),
 * area × kg per m² otherwise. Null when the numbers to work it out are missing.
 */
export function estimatedYieldKg(
  p: { plantingMode: PlantingMode; areaM2: number; quantity: number | null; yieldKgPerPlantOverride: number | null },
  crop: { yieldKgPerM2: number; yieldKgPerPlant: number | null } | undefined,
): number | null {
  if (!crop) return null;
  if (p.plantingMode === "count") {
    const perPlant = p.yieldKgPerPlantOverride ?? crop.yieldKgPerPlant;
    if (!perPlant || !p.quantity) return null;
    return Math.round(p.quantity * perPlant * 10) / 10;
  }
  return Math.round(p.areaM2 * crop.yieldKgPerM2 * 10) / 10;
}
