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

async function getFirstCropId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number; kcalPerKg: number }[];
  const withKcal = crops.find((c) => c.kcalPerKg > 0);
  return withKcal ? withKcal.id : crops[0].id;
}

async function createLocation(
  request: APIRequestContext,
  householdId: number,
  name: string,
  areaM2 = 4.0,
): Promise<{ id: number }> {
  const res = await request.post('/api/location', {
    data: { householdId, name, areaM2 },
  });
  return (await res.json()) as { id: number };
}

async function createActivePlanting(
  request: APIRequestContext,
  cropId: number,
  locationId: number,
): Promise<void> {
  await request.post('/api/planting', {
    data: {
      cropId,
      locationId,
      plantedDate: '2026-04-01',
      areaM2: 2.0,
      plantingMode: 'area',
      status: 'growing',
    },
  });
}

/** Wait for the page's first data load to complete. */
async function waitForDetailReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Location detail page — navigation', () => {
  test('clicking a location name on /locations navigates to /locations/[id]', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const location = await createLocation(request, householdId, 'Navigeringstest Bädd');

    // Act
    await page.goto('/locations');
    await page.waitForLoadState('networkidle');
    const link = page.locator(`a[href="/locations/${location.id}"]`);
    await expect(link).toBeVisible();
    await link.click();

    // Assert
    await expect(page).toHaveURL(new RegExp(`/locations/${location.id}`));
  });
});

test.describe('Location detail page — content', () => {
  let householdId: number;
  let locationId: number;
  let cropId: number;

  test.beforeEach(async ({ request }) => {
    // Arrange — create a location with an active planting so all sections render
    householdId = await getOrCreateHouseholdId(request);
    cropId = await getFirstCropId(request);

    const location = await createLocation(request, householdId, 'Detaljsida Pallkrage', 6.0);
    locationId = location.id;

    await createActivePlanting(request, cropId, locationId);
  });

  test('detail page shows the location name in a heading', async ({ page }) => {
    // Arrange
    await page.goto(`/locations/${locationId}`);
    await waitForDetailReady(page);

    // Assert — location name must appear inside a heading element
    await expect(page.getByRole('heading', { name: 'Detaljsida Pallkrage' })).toBeVisible();
  });

  test('detail page shows the word "kcal" somewhere on the page', async ({ page }) => {
    // Arrange
    await page.goto(`/locations/${locationId}`);
    await waitForDetailReady(page);

    // Assert
    await expect(page.getByText(/kcal/i).first()).toBeVisible();
  });

  test('active planting crop name appears on the detail page', async ({ page, request }) => {
    // Arrange — verify planting exists for this location
    const summaryRes = await request.get(`/api/location/${locationId}/summary`);
    const summary = (await summaryRes.json()) as {
      plantings: { cropName: string }[];
    };

    // If the planting was cleaned up by a prior test, re-create it
    if (summary.plantings.length === 0) {
      await createActivePlanting(request, cropId, locationId);
    }

    // Look up the crop name
    const cropsRes = await request.get('/api/crops');
    const crops = (await cropsRes.json()) as { id: number; name: string }[];
    const thisCrop = crops.find((c) => c.id === cropId);
    const cropName = thisCrop!.name;

    await page.goto(`/locations/${locationId}`);
    await waitForDetailReady(page);

    // Assert
    await expect(page.getByText(cropName).first()).toBeVisible();
  });
});

test.describe('Location detail page — back navigation', () => {
  test('a back button or breadcrumb returns to /locations', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const location = await createLocation(request, householdId, 'Tillbaka Test Bädd');

    await page.goto(`/locations/${location.id}`);
    await waitForDetailReady(page);

    // Act — click the back link (link to /locations)
    const backLink = page.locator('a[href="/locations"]').first();
    await expect(backLink).toBeVisible();
    await backLink.click();

    // Assert
    await expect(page).toHaveURL(/\/locations$/);
  });

  test('empty "no plantings" state on a location is a clickable shortcut to /plantings with location pre-filled', async ({
    page,
    request,
  }) => {
    // Arrange — location with NO plantings
    const householdId = await getOrCreateHouseholdId(request);
    const location = await createLocation(request, householdId, 'Tom Genväg-Bädd');

    await page.goto(`/locations/${location.id}`);
    await waitForDetailReady(page);

    // Act — the "no plantings yet" card is now clickable
    const cta = page.getByTestId('empty-state-cta');
    await expect(cta).toBeVisible();
    await cta.click();

    // Assert — landed on /plantings with the locationId query, form is open, location is pre-filled
    await expect(page).toHaveURL(new RegExp(`/plantings\\?locationId=${location.id}$`));
    const form = page.getByTestId('planting-form');
    await expect(form).toBeVisible();
    // Location SearchableCombobox displays the chosen location's name in its input value
    await expect(form.locator('#locationId').getByRole('combobox')).toHaveValue(/^Tom Genväg-Bädd/);
  });
});
