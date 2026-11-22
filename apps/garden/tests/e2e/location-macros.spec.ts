import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Setup helpers
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

async function deleteAllMacroTargets(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const res = await request.get(`/api/macro-target?householdId=${householdId}`);
  if (!res.ok()) return;

  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return;

  const targets = body as { id: number }[];
  for (const target of targets) {
    await request.delete(`/api/macro-target/${target.id}`);
  }
}

async function createActiveMacroTarget(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const target = (await (
    await request.post('/api/macro-target', {
      data: {
        householdId,
        name: 'Testprofil',
        dailyKcal: 2000,
        dailyProteinG: 150,
        dailyCarbsG: 250,
        dailyFatG: 70,
      },
    })
  ).json()) as { id: number };

  await request.post(`/api/macro-target/${target.id}/activate`);
}

async function getFirstCropId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number; kcalPerKg: number }[];
  // Prefer a crop with known kcal so the kcal assertion is meaningful
  const withKcal = crops.find((c) => c.kcalPerKg > 0);
  return withKcal ? withKcal.id : crops[0].id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Location cards — macro breakdown', () => {
  test.beforeEach(async ({ request }) => {
    // Arrange — ensure a household and an active macro target exist
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllMacroTargets(request, householdId);
    await createActiveMacroTarget(request, householdId);
  });

  test('location card shows kcal stat', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);

    const location = (await (
      await request.post('/api/location', {
        data: { householdId, name: 'Pallkrage Kcal Test', areaM2: 4.0 },
      })
    ).json()) as { id: number };

    // Create an area-mode planting in the new location
    await request.post('/api/planting', {
      data: {
        cropId,
        locationId: location.id,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        plantingMode: 'area',
        status: 'growing',
      },
    });

    // Act
    await page.goto('/locations');

    // Assert — the card for the new location must display the word "kcal"
    const card = page.getByTestId('location-card').filter({ hasText: 'Pallkrage Kcal Test' });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/kcal/i);
  });

  test('location with no active plantings shows 0 kcal', async ({ page, request }) => {
    // Arrange — create a location but add no plantings
    const householdId = await getOrCreateHouseholdId(request);

    await request.post('/api/location', {
      data: { householdId, name: 'Tom Pallkrage', areaM2: 2.0 },
    });

    // Act
    await page.goto('/locations');

    // Assert — card renders without crashing and shows 0 kcal
    const card = page.getByTestId('location-card').filter({ hasText: 'Tom Pallkrage' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('0');
  });
});
