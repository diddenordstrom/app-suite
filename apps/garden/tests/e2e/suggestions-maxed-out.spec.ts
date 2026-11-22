// @ts-check
import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers (duplicated from suggestions.spec.ts to keep specs self-contained)
// ---------------------------------------------------------------------------

async function getOrCreateHouseholdId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0].id;

  const created = (await (
    await request.post('/api/household', {
      data: { name: 'Test Family', persons: 4 },
    })
  ).json()) as { id: number };

  return created.id;
}

async function setHouseholdZone(
  request: APIRequestContext,
  householdId: number,
  zone: number,
): Promise<void> {
  await request.put(`/api/household/${householdId}`, { data: { growingZone: zone } });
}

async function getCropByName(request: APIRequestContext, name: string): Promise<{ id: number }> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number; name: string }[];
  const found = crops.find((c) => c.name === name);
  if (!found) throw new Error(`Crop not found: ${name}`);
  return { id: found.id };
}

async function deleteAllPlantings(request: APIRequestContext): Promise<void> {
  const res = await request.get('/api/planting');
  if (!res.ok()) return;
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return;
  for (const p of body as { id: number }[]) {
    await request.delete(`/api/planting/${p.id}`);
  }
}

async function clearWishlist(request: APIRequestContext, householdId: number): Promise<void> {
  const res = await request.get(`/api/wishlist?householdId=${householdId}`);
  if (!res.ok()) return;
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return;
  for (const entry of body as { id: number }[]) {
    await request.delete(`/api/wishlist/${entry.id}`);
  }
}

async function deleteAllLocations(request: APIRequestContext): Promise<void> {
  const res = await request.get('/api/location');
  if (!res.ok()) return;
  const locations = (await res.json()) as { id: number }[];
  for (const loc of locations) {
    await request.delete(`/api/location/${loc.id}`);
  }
}

async function createOutdoorLocation(
  request: APIRequestContext,
  householdId: number,
  name: string = 'Köksträdgård',
): Promise<number> {
  const created = (await (
    await request.post('/api/location', {
      data: { name, areaM2: 10, householdId },
    })
  ).json()) as { id: number };
  return created.id;
}

// ---------------------------------------------------------------------------
// Test y — maxed-out family banner appears with family name interpolated
// Scenario: 3 Solanaceae crops on wishlist + Solanaceae planting in the only
// bed (hard-excludes Solanaceae for 4 years) → banner shows family name.
// ---------------------------------------------------------------------------

test.describe('Suggestions — maxed-out family banner (Layer 7)', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
    await deleteAllPlantings(request);
    await deleteAllLocations(request);

    // Zone 2 (Stockholm): firstFrost Oct 15, lastFrost May 8
    await setHouseholdZone(request, householdId, 2);

    // One outdoor bed
    const locationId = await createOutdoorLocation(request, householdId);

    // Solanaceae crops from seed data: Tomat, Paprika, Chili
    const tomat = await getCropByName(request, 'Tomat');
    const paprika = await getCropByName(request, 'Paprika');
    const chili = await getCropByName(request, 'Chili');

    // Seed 3 Solanaceae wishlist rows (≥ 3 triggers the check)
    await request.post('/api/wishlist', {
      data: { householdId, cropId: tomat.id, kgPerWeek: 1 },
    });
    await request.post('/api/wishlist', {
      data: { householdId, cropId: paprika.id, kgPerWeek: 1 },
    });
    await request.post('/api/wishlist', {
      data: { householdId, cropId: chili.id, kgPerWeek: 1 },
    });

    // Create an active Solanaceae (Tomat) planting in the only bed.
    // Planted 6 months ago, harvesting 6 months from now — it's a recent
    // Solanaceae planting which triggers the 4-year hard-exclusion rule.
    const today = new Date();
    const plantedDate = new Date(today);
    plantedDate.setMonth(plantedDate.getMonth() - 6);
    const harvestDate = new Date(today);
    harvestDate.setMonth(harvestDate.getMonth() + 6);

    await request.post('/api/planting', {
      data: {
        cropId: tomat.id,
        locationId,
        plantedDate: plantedDate.toISOString().slice(0, 10),
        expectedHarvestDate: harvestDate.toISOString().slice(0, 10),
        areaM2: 5,
        status: 'planted',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Test y — banner appears with Solanaceae family name
  // ---------------------------------------------------------------------------

  test('maxed-out family banner appears on suggestions page with family name', async ({ page }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    // The banner should be visible
    await expect(page.getByTestId('maxed-out-family-banner').first()).toBeVisible({
      timeout: 5000,
    });

    // The banner text should contain the family name 'solanaceae'
    // (seed data stores cropFamily as lowercase 'solanaceae')
    await expect(page.getByTestId('maxed-out-family-banner').first()).toContainText('solanaceae', {
      ignoreCase: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Test z — banner is absent when no families are maxed
  // Regression: existing suggestions page without blocked families must not
  // render the banner.
  // ---------------------------------------------------------------------------

  test('maxed-out family banner is absent when no families are maxed', async ({
    page,
    request,
  }) => {
    // Clear the Solanaceae plantings so rotation no longer blocks
    await deleteAllPlantings(request);

    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    // Banner must not be visible
    await expect(page.getByTestId('maxed-out-family-banner')).not.toBeVisible();
  });
});
