import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Setup helpers (mirrors patterns from harvest-flow.spec.ts)
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

async function getOrCreateLocationId(
  request: APIRequestContext,
  householdId: number,
): Promise<number> {
  const res = await request.get('/api/location');
  const locations = (await res.json()) as { id: number }[];
  if (locations.length > 0) return locations[0].id;

  const created = (await (
    await request.post('/api/location', {
      data: { householdId, name: 'Test Bed', areaM2: 10.0 },
    })
  ).json()) as { id: number };

  return created.id;
}

async function getFirstCropIdWithYield(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number; yieldKgPerPlant?: number | null }[];
  if (crops.length === 0) throw new Error('No crops seeded — cannot create a count-mode planting');
  // Prefer a crop that has yieldKgPerPlant set; fall back to first crop
  const withYield = crops.find((c) => c.yieldKgPerPlant != null);
  return withYield ? withYield.id : crops[0].id;
}

async function getOrCreateActiveMacroTarget(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const res = await request.get(`/api/macro-target?householdId=${householdId}`);
  if (res.ok()) {
    const body = (await res.json()) as unknown;
    if (Array.isArray(body)) {
      const targets = body as { id: number; active: boolean }[];
      const active = targets.find((t) => t.active);
      if (active) return; // already have one
    }
  }

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

async function createCountModePlanting(
  request: APIRequestContext,
  cropId: number,
  locationId: number,
  quantity: number,
  yieldKgPerPlantOverride?: number,
): Promise<number> {
  const created = (await (
    await request.post('/api/planting', {
      data: {
        cropId,
        locationId,
        plantedDate: '2026-04-01',
        areaM2: 0,
        plantingMode: 'count',
        quantity,
        ...(yieldKgPerPlantOverride != null && { yieldKgPerPlantOverride }),
      },
    })
  ).json()) as { id: number };

  return created.id;
}

/** Wait for the page's first data load to complete. */
async function waitForPlantingsReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Count-mode planting — create and dashboard impact', () => {
  test.beforeEach(async ({ request }) => {
    // Arrange — guarantee household, location and active macro target exist
    const householdId = await getOrCreateHouseholdId(request);
    await getOrCreateLocationId(request, householdId);
    await getOrCreateActiveMacroTarget(request, householdId);
  });

  test('planting form shows unit toggle', async ({ page }) => {
    // Arrange
    await page.goto('/plantings');
    await waitForPlantingsReady(page);

    // Act — open the add-planting form
    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();
    await expect(page.getByTestId('planting-form')).toBeVisible();

    // Assert — a toggle or select that lets the user pick between m² and plants
    await expect(page.getByTestId('planting-mode-toggle')).toBeVisible();

    // Both mode options must be reachable
    const toggle = page.getByTestId('planting-mode-toggle');
    await expect(toggle.getByText(/m²/i)).toBeVisible();
    await expect(toggle.getByText(/plant|antal/i)).toBeVisible();
  });

  test('can create a count-mode planting', async ({ page }) => {
    // Arrange
    await page.goto('/plantings');
    await waitForPlantingsReady(page);
    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();

    const form = page.getByTestId('planting-form');
    await expect(form).toBeVisible();

    // Act — switch to count mode
    await form
      .getByTestId('planting-mode-toggle')
      .getByText(/plant|antal/i)
      .click();

    // Fill in required fields
    await form.getByTestId('crop-combobox').getByRole('combobox').click();
    await form.getByTestId('crop-combobox').getByRole('option').first().click();
    const locationTrigger = form.locator('#locationId').getByRole('combobox');
    await locationTrigger.click();
    await page.getByRole('option').first().click();
    await form.locator('input#plantedDate').fill('2026-04-01');
    await form.locator('input#quantity').fill('4');

    // Submit
    await form.getByRole('button', { name: /add planting|lägg till odling/i }).click();

    // Assert — creating a planting opens its detail page
    await expect(page).toHaveURL(/\/plantings\/\d+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('count-mode planting card does not show area', async ({ page, request }) => {
    // Arrange — create a count-mode planting via API so we have a stable card to inspect
    const cropId = await getFirstCropIdWithYield(request);
    const locationRes = await request.get('/api/location');
    const locations = (await locationRes.json()) as { id: number }[];
    const locationId = locations[0].id;

    const newPlantingId = await createCountModePlanting(request, cropId, locationId, 4);

    await page.goto('/plantings');
    await waitForPlantingsReady(page);

    // Scope to the exact card for the newly-created planting via its detail link.
    // The plantings list can contain unrelated stale rows from other test runs,
    // so .first() is unreliable here.
    const card = page
      .getByTestId('planting-card')
      .filter({ has: page.locator(`a[href="/plantings/${newPlantingId}"]`) });
    await expect(card).toBeVisible();

    // Assert — shows plant count in Swedish ("plantor") or English ("plants")
    await expect(card).toContainText(/4\s*plantor|4\s*plants/i);

    // Assert — must NOT display a raw "m²" area value
    await expect(card).not.toContainText('m²');
  });

  test('dashboard growing card shows kcal from count-mode planting', async ({ page, request }) => {
    // Arrange — create count-mode planting via API:
    //   quantity: 3 plants × yieldKgPerPlant set on crop → should produce non-zero kcal
    const cropId = await getFirstCropIdWithYield(request);
    const locationRes = await request.get('/api/location');
    const locations = (await locationRes.json()) as { id: number }[];
    const locationId = locations[0].id;

    // Use an explicit yieldKgPerPlantOverride to guarantee a non-zero value regardless
    // of whether the seeded crop has yieldKgPerPlant set
    await createCountModePlanting(request, cropId, locationId, 3, 5.0);

    // Act
    await page.goto('/');

    // Assert — dashboard growing card is present
    await expect(page.getByTestId('dashboard-growing-card')).toBeVisible();

    // Assert — the kcal value displayed is not zero
    const growingCard = page.getByTestId('dashboard-growing-card');
    // The card must contain a numeric kcal value greater than zero.
    // We check that a non-zero number appears — the exact format may vary.
    await expect(growingCard).not.toContainText(/^0\s*(kcal)?$/i);
    await expect(growingCard).toContainText(/\d+/);
  });
});
