import { test, expect, type APIRequestContext } from '@playwright/test';

async function getOrCreateHouseholdId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0].id;
  const created = (await (
    await request.post('/api/household', { data: { name: 'Test Family', persons: 4 } })
  ).json()) as { id: number };
  return created.id;
}

async function ensureLocation(
  request: APIRequestContext,
  householdId: number,
  name: string,
): Promise<number> {
  const locations = (await (await request.get('/api/location')).json()) as {
    id: number;
    name: string;
  }[];
  const existing = locations.find((l) => l.name === name);
  if (existing) return existing.id;
  const created = (await (
    await request.post('/api/location', {
      data: { householdId, name, areaM2: 4.0 },
    })
  ).json()) as { id: number };
  return created.id;
}

async function firstTwoDistinctCrops(
  request: APIRequestContext,
): Promise<{ id: number; name: string }[]> {
  const crops = (await (await request.get('/api/crops')).json()) as { id: number; name: string }[];
  return [crops[0]!, crops[1]!];
}

async function ensurePlanting(
  request: APIRequestContext,
  cropId: number,
  locationId: number,
): Promise<void> {
  const existing = (await (await request.get('/api/planting')).json()) as {
    cropId: number;
    locationId: number;
  }[];
  if (existing.some((p) => p.cropId === cropId && p.locationId === locationId)) return;
  await request.post('/api/planting', {
    data: {
      cropId,
      locationId,
      plantedDate: '2026-04-01',
      areaM2: 1,
    },
  });
}

test.describe('Plantings list — search by crop + location', () => {
  test('filters cards by crop name (diacritic-insensitive)', async ({ page, request }) => {
    // Arrange — two plantings with distinct crops on distinct beds.
    const householdId = await getOrCreateHouseholdId(request);
    const locA = await ensureLocation(request, householdId, 'Polytunnel-search');
    const locB = await ensureLocation(request, householdId, 'Outdoor-bed-search');
    const [cropA, cropB] = await firstTwoDistinctCrops(request);
    await ensurePlanting(request, cropA!.id, locA);
    await ensurePlanting(request, cropB!.id, locB);

    await page.goto('/plantings');
    await page.waitForLoadState('networkidle');

    // Act — open the search bar (it's an icon button until clicked) and type
    // a diacritic-stripped prefix of the first crop name.
    await page.getByTestId('plantings-search-toggle').click();
    const search = page.getByTestId('plantings-search');
    const term = cropA!.name.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 4);
    await search.fill(term);

    // Assert — only cards whose crop name (normalized) contains the term remain.
    const cards = page.getByTestId('planting-card');
    const visibleNames = await cards.locator('h2').allTextContents();
    expect(visibleNames.length).toBeGreaterThan(0);
    for (const name of visibleNames) {
      const normalized = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      expect(normalized).toContain(term.toLowerCase());
    }
  });

  test('filters cards by location name', async ({ page, request }) => {
    // Arrange — same setup as above.
    const householdId = await getOrCreateHouseholdId(request);
    const locA = await ensureLocation(request, householdId, 'Polytunnel-search');
    const locB = await ensureLocation(request, householdId, 'Outdoor-bed-search');
    const [cropA, cropB] = await firstTwoDistinctCrops(request);
    await ensurePlanting(request, cropA!.id, locA);
    await ensurePlanting(request, cropB!.id, locB);

    await page.goto('/plantings');
    await page.waitForLoadState('networkidle');

    // Act — search by part of the location name.
    await page.getByTestId('plantings-search-toggle').click();
    await page.getByTestId('plantings-search').fill('Polytunnel');

    // Assert — only planting in that bed remains; the other is filtered out.
    const cards = page.getByTestId('planting-card');
    await expect(cards).toHaveCount(1);
  });

  test('empty state appears when search yields zero matches', async ({ page, request }) => {
    // Arrange — at least one planting exists.
    const householdId = await getOrCreateHouseholdId(request);
    const loc = await ensureLocation(request, householdId, 'Polytunnel-search');
    const [cropA] = await firstTwoDistinctCrops(request);
    await ensurePlanting(request, cropA!.id, loc);

    await page.goto('/plantings');
    await page.waitForLoadState('networkidle');

    // Act — type something that matches nothing.
    await page.getByTestId('plantings-search-toggle').click();
    await page.getByTestId('plantings-search').fill('zzz-no-match-zzz');

    // Assert — search-empty state visible, no cards.
    await expect(page.getByTestId('planting-card')).toHaveCount(0);
    await expect(page.getByTestId('plantings-search-empty')).toBeVisible();
  });
});
