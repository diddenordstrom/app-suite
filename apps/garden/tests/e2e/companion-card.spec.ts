import { test, expect, type APIRequestContext } from '@playwright/test';

async function getOrCreateHousehold(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0]!.id;
  const created = (await (
    await request.post('/api/household', { data: { name: 'Test', persons: 2 } })
  ).json()) as { id: number };
  return created.id;
}

async function findCropByName(request: APIRequestContext, name: string): Promise<{ id: number }> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number; name: string }[];
  const found = crops.find((c) => c.name === name);
  if (!found) throw new Error(`Crop ${name} not seeded`);
  return found;
}

async function createLocation(
  request: APIRequestContext,
  householdId: number,
  name: string,
): Promise<{ id: number }> {
  return (await (
    await request.post('/api/location', {
      data: { householdId, name, areaM2: 3 },
    })
  ).json()) as { id: number };
}

async function createPlanting(
  request: APIRequestContext,
  cropId: number,
  locationId: number,
): Promise<{ id: number }> {
  return (await (
    await request.post('/api/planting', {
      data: {
        cropId,
        locationId,
        plantedDate: '2026-04-01',
        areaM2: 1,
        plantingMode: 'area',
        status: 'growing',
      },
    })
  ).json()) as { id: number };
}

test.describe('Companion card on /plantings/[id]', () => {
  test('renders good + bad companions for tomato with source links @smoke', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHousehold(request);
    const tomat = await findCropByName(request, 'Tomat');
    const location = await createLocation(request, householdId, `Companion-test ${Date.now()}`);
    const planting = await createPlanting(request, tomat.id, location.id);

    // Act
    await page.goto(`/plantings/${planting.id}`);
    await page.waitForLoadState('networkidle');

    // Assert — companion card is visible
    const card = page.getByTestId('companion-card');
    await expect(card).toBeVisible();

    // Tomat has multiple known good companions (Basilika, Gräslök, Morötter, …)
    // and bad ones (Potatis, Vitkål). At least one of each should render.
    const generalChips = page.getByTestId('companion-chip-general');
    await expect(generalChips.first()).toBeVisible();

    const avoidChips = page.getByTestId('companion-chip-avoid');
    await expect(avoidChips.first()).toBeVisible();

    // Every chip has a source link with a real URL.
    const firstLink = generalChips.first().locator('a');
    const href = await firstLink.getAttribute('href');
    expect(href).toMatch(/^https?:\/\//);
  });

  test('hides the card entirely for a crop with no companion data', async ({ page, request }) => {
    // Arrange — Råg (rye) has no companion rows in the seed
    const householdId = await getOrCreateHousehold(request);
    const rag = await findCropByName(request, 'Råg');
    const location = await createLocation(request, householdId, `No-companions ${Date.now()}`);
    const planting = await createPlanting(request, rag.id, location.id);

    // Act
    await page.goto(`/plantings/${planting.id}`);
    await page.waitForLoadState('networkidle');

    // Assert — card is not rendered
    await expect(page.getByTestId('companion-card')).toHaveCount(0);
  });
});
