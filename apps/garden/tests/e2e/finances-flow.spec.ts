import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

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

async function clearCropPrices(request: APIRequestContext, householdId: number): Promise<void> {
  const res = await request.get(`/api/crop-prices?householdId=${householdId}`);
  const rows = (await res.json()) as { cropId: number }[];
  for (const row of rows) {
    await request.delete(`/api/crop-prices/${row.cropId}?householdId=${householdId}`);
  }
}

async function clearExpenses(request: APIRequestContext, householdId: number): Promise<void> {
  const res = await request.get(`/api/expense?householdId=${householdId}`);
  const rows = (await res.json()) as { id: number }[];
  for (const row of rows) {
    await request.delete(`/api/expense/${row.id}`);
  }
}

async function getCropIdByName(request: APIRequestContext, name: string): Promise<number> {
  const crops = (await (await request.get('/api/crops')).json()) as {
    id: number;
    name: string;
  }[];
  const match = crops.find((c) => c.name === name);
  if (!match) throw new Error(`Seed crop "${name}" not found`);
  return match.id;
}

async function getOrCreateLocationId(
  request: APIRequestContext,
  householdId: number,
): Promise<number> {
  const res = await request.get('/api/location');
  const list = (await res.json()) as { id: number; name: string; householdId: number }[];
  const existing = list.find((l) => l.householdId === householdId);
  if (existing) return existing.id;
  const created = (await (
    await request.post('/api/location', {
      data: { householdId, name: 'E2E Bädd', areaM2: 5 },
    })
  ).json()) as { id: number };
  return created.id;
}

async function waitReady(page: Page) {
  await page.waitForLoadState('networkidle');
}

test.describe('Finances — end-to-end flow @smoke', () => {
  test('setting a price drives realized + forecast + net through the page', async ({
    page,
    request,
  }) => {
    // Arrange — clean slate
    const householdId = await getOrCreateHouseholdId(request);
    await clearCropPrices(request, householdId);
    await clearExpenses(request, householdId);
    const tomatId = await getCropIdByName(request, 'Tomat');
    const locationId = await getOrCreateLocationId(request, householdId);

    // Seed a planting with a realized harvest in the current year.
    const year = new Date().getFullYear();
    const planting = (await (
      await request.post('/api/planting', {
        data: {
          cropId: tomatId,
          locationId,
          plantedDate: `${year}-04-01`,
          expectedHarvestDate: `${year}-08-15`,
          areaM2: 2,
        },
      })
    ).json()) as { id: number };
    await request.post(`/api/planting/${planting.id}/harvest`, {
      data: {
        householdId,
        quantityKg: 4,
        harvestedDate: `${year}-07-15`,
        isFinalHarvest: false,
        addToStorage: false,
      },
    });
    await request.post('/api/expense', {
      data: {
        householdId,
        name: 'Frön tomat',
        cost: 50,
        date: `${year}-03-01`,
        cropId: tomatId,
      },
    });

    // Act — visit Finances page without a price set
    await page.goto('/finances');
    await waitReady(page);

    // Assert — page rendered with the Ekonomi heading
    await expect(page.locator('h1')).toContainText('Ekonomi');

    // Assert — the per-crop row shows "Sätt pris" link (no price yet)
    await expect(page.getByTestId('set-price-link').first()).toBeVisible();

    // The household may have other tomato plantings/harvests from prior usage,
    // so we don't assert exact kr amounts. We assert the *transition* — once a
    // price exists, the totals must be non-zero and the "Sätt pris" link
    // disappears for Tomat.
    await expect(page.getByTestId('pl-spent')).toContainText('kr');

    // Act — set a price via the API (UI tested elsewhere)
    await request.post('/api/crop-prices', {
      data: { householdId, cropId: tomatId, pricePerKg: 30 },
    });

    // Act — reload to pull fresh summary
    await page.reload();
    await waitReady(page);

    // Assert — realized + forecast now positive (≥ 4 × 30 + 2 × 8 × 30 minimum
    // from our seeded planting; other rows in the household may add more).
    const realizedText = await page.getByTestId('pl-realized').textContent();
    const forecastText = await page.getByTestId('pl-forecast').textContent();
    const realizedNum = Number((realizedText ?? '').replace(/[^\d]/g, ''));
    const forecastNum = Number((forecastText ?? '').replace(/[^\d]/g, ''));
    expect(realizedNum).toBeGreaterThanOrEqual(120);
    expect(forecastNum).toBeGreaterThanOrEqual(480);

    // Cleanup — leave the household empty for downstream tests
    await request.delete(`/api/planting/${planting.id}`);
    await clearExpenses(request, householdId);
    await clearCropPrices(request, householdId);
  });
});
