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

async function getFirstCropId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number }[];
  if (crops.length === 0) throw new Error('No crops seeded — cannot create a planting');
  return crops[0].id;
}

async function createPlanting(
  request: APIRequestContext,
  cropId: number,
  locationId: number,
): Promise<number> {
  const created = (await (
    await request.post('/api/planting', {
      data: {
        cropId,
        locationId,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
      },
    })
  ).json()) as { id: number };

  return created.id;
}

async function getOrCreatePlantingId(request: APIRequestContext): Promise<number> {
  // Prefer a planting that is not yet harvested so the "Skörda" button is visible.
  const res = await request.get('/api/planting');
  const plantings = (await res.json()) as { id: number; status: string }[];
  const active = plantings.find((p) => p.status !== 'harvested');
  if (active) return active.id;

  const householdId = await getOrCreateHouseholdId(request);
  const locationId = await getOrCreateLocationId(request, householdId);
  const cropId = await getFirstCropId(request);
  return createPlanting(request, cropId, locationId);
}

async function countStorageItems(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/storage');
  const items = (await res.json()) as unknown[];
  return items.length;
}

// ---------------------------------------------------------------------------
// Tests — all harvest CRUD lives on /plantings/[id]; the list is read-only.
// ---------------------------------------------------------------------------

test.describe('Harvest flow — full harvest with storage', () => {
  test.beforeEach(async ({ request }) => {
    await getOrCreatePlantingId(request);
  });

  test('harvest dialog appears when "Skörda" is clicked on detail page', async ({
    page,
    request,
  }) => {
    // Arrange
    const id = await getOrCreatePlantingId(request);
    await page.goto(`/plantings/${id}`);
    await page.waitForLoadState('networkidle');

    // Act
    await page.getByTestId('planting-detail-harvest-btn').click();

    // Assert
    await expect(page.getByTestId('planting-harvest-form')).toBeVisible();
  });

  test('harvest dialog is dismissed by the cancel button', async ({ page, request }) => {
    // Arrange
    const id = await getOrCreatePlantingId(request);
    await page.goto(`/plantings/${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('planting-detail-harvest-btn').click();
    const form = page.getByTestId('planting-harvest-form');
    await expect(form).toBeVisible();

    // Act
    await form.getByRole('button', { name: 'Avbryt' }).click();

    // Assert
    await expect(form).not.toBeVisible();
  });

  test('final harvest marks planting as harvested and adds item to storage @smoke', async ({
    page,
    request,
  }) => {
    // Arrange
    const id = await getOrCreatePlantingId(request);
    const storageCountBefore = await countStorageItems(request);
    const today = new Date().toISOString().slice(0, 10);
    await page.goto(`/plantings/${id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('planting-detail-harvest-btn').click();
    const form = page.getByTestId('planting-harvest-form');
    await expect(form).toBeVisible();

    // Act — fill in harvest details
    await form.locator('input[type="number"]').fill('2.5');
    // unit defaults to kg — no need to interact with the unit picker
    await form.locator('input[type="date"]').fill(today);

    const isFinalCheckbox = form.locator('input[type="checkbox"]').nth(0);
    const addToStorageCheckbox = form.locator('input[type="checkbox"]').nth(1);
    if (!(await isFinalCheckbox.isChecked())) await isFinalCheckbox.check();
    if (!(await addToStorageCheckbox.isChecked())) await addToStorageCheckbox.check();

    await form.getByRole('button', { name: 'Logga skörd' }).click();

    // Assert — dialog closes; status flips to "Skördad" on the detail page
    await expect(form).not.toBeVisible();
    await expect(page.getByTestId('planting-detail-status')).toHaveText('Skördad');

    // Assert — storage page has a card showing 2.5 kg
    await page.goto('/storage');
    const storageCountAfter = await countStorageItems(request);
    expect(storageCountAfter).toBe(storageCountBefore + 1);
    await expect(
      page.getByTestId('storage-group').filter({ hasText: '2.5' }).first(),
    ).toBeVisible();
  });
});

test.describe('Harvest flow — partial harvest, plant stays growing', () => {
  test('partial harvest keeps planting active and adds item to storage', async ({
    page,
    request,
  }) => {
    // Arrange
    const id = await getOrCreatePlantingId(request);
    const storageCountBefore = await countStorageItems(request);
    await page.goto(`/plantings/${id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('planting-detail-harvest-btn').click();
    const form = page.getByTestId('planting-harvest-form');

    // Act — fill quantity, leave "Slutskörd" unchecked
    await form.locator('input[type="number"]').fill('1');
    // unit defaults to kg — no need to interact with the unit picker

    const isFinalCheckbox = form.locator('input[type="checkbox"]').nth(0);
    const addToStorageCheckbox = form.locator('input[type="checkbox"]').nth(1);
    if (await isFinalCheckbox.isChecked()) await isFinalCheckbox.uncheck();
    if (!(await addToStorageCheckbox.isChecked())) await addToStorageCheckbox.check();

    await form.getByRole('button', { name: 'Logga skörd' }).click();
    await expect(form).not.toBeVisible();

    // Assert — "Skörda" button is still visible (plant not marked harvested)
    await expect(page.getByTestId('planting-detail-harvest-btn')).toBeVisible();

    // Assert — item was added to storage
    await page.goto('/storage');
    const storageCountAfter = await countStorageItems(request);
    expect(storageCountAfter).toBe(storageCountBefore + 1);
  });
});

test.describe('Harvest flow — harvest without adding to storage', () => {
  test('harvest without storage does not create a storage entry', async ({ page, request }) => {
    // Arrange
    const id = await getOrCreatePlantingId(request);
    const storageCountBefore = await countStorageItems(request);
    await page.goto(`/plantings/${id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('planting-detail-harvest-btn').click();
    const form = page.getByTestId('planting-harvest-form');

    // Act
    await form.locator('input[type="number"]').fill('0.5');
    // unit defaults to kg — no need to interact with the unit picker

    const isFinalCheckbox = form.locator('input[type="checkbox"]').nth(0);
    const addToStorageCheckbox = form.locator('input[type="checkbox"]').nth(1);
    if (!(await isFinalCheckbox.isChecked())) await isFinalCheckbox.check();
    if (await addToStorageCheckbox.isChecked()) await addToStorageCheckbox.uncheck();

    await form.getByRole('button', { name: 'Logga skörd' }).click();
    await expect(form).not.toBeVisible();

    // Assert — planting status now reads "Skördad"
    await expect(page.getByTestId('planting-detail-status')).toHaveText('Skördad');

    // Assert — storage count is unchanged
    await page.goto('/storage');
    const storageCountAfter = await countStorageItems(request);
    expect(storageCountAfter).toBe(storageCountBefore);
  });
});

test.describe('Harvest flow — gram unit display in storage', () => {
  test('500 gram harvest is stored and displayed as 500 g', async ({ page, request }) => {
    // Arrange
    const id = await getOrCreatePlantingId(request);
    const storageCountBefore = await countStorageItems(request);
    await page.goto(`/plantings/${id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('planting-detail-harvest-btn').click();
    const form = page.getByTestId('planting-harvest-form');

    // Act — enter 500 in grams
    await form.locator('input[type="number"]').fill('500');
    await page.getByTestId('harvest-unit-select').click();
    // The i18n label for "g" is "gram" in Swedish — match prefix to avoid kg.
    await page.getByRole('option', { name: /^gram$/i }).click();

    const isFinalCheckbox = form.locator('input[type="checkbox"]').nth(0);
    const addToStorageCheckbox = form.locator('input[type="checkbox"]').nth(1);
    if (!(await isFinalCheckbox.isChecked())) await isFinalCheckbox.check();
    if (!(await addToStorageCheckbox.isChecked())) await addToStorageCheckbox.check();

    await form.getByRole('button', { name: 'Logga skörd' }).click();
    await expect(form).not.toBeVisible();

    // Assert — storage page has a card showing "500 g", not "0.5 kg"
    await page.goto('/storage');
    const storageCountAfter = await countStorageItems(request);
    expect(storageCountAfter).toBe(storageCountBefore + 1);
    await expect(
      page.getByTestId('storage-group').filter({ hasText: '500 g' }).first(),
    ).toBeVisible();
  });
});
