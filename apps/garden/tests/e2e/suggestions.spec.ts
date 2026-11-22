import { test, expect, type APIRequestContext } from '@playwright/test';

// Quarantined (test.fixme): the empty-bed, succession and seedling-transplant tests seed crops with
// spring/summer sowing windows and read the real server clock, so they fail outside the season.
// See "Season-proof suggestion e2e" in BACKLOG.md.

// ---------------------------------------------------------------------------
// Helpers
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

async function clearSuggestionEvents(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const res = await request.get(`/api/suggestions?householdId=${householdId}`);
  if (!res.ok()) return;
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return;
  for (const s of body as { id: number }[]) {
    await request.delete(`/api/garden-event/${s.id}`);
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
// Tests — No data
// ---------------------------------------------------------------------------

test.describe('Suggestions — no data', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
    await clearSuggestionEvents(request, householdId);
    await deleteAllPlantings(request);
    await deleteAllLocations(request);
  });

  test('suggestions widget is not shown when there are no suggestions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('suggestions-widget')).not.toBeVisible();
  });

  test('suggestions page shows empty state', async ({ page }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('suggestions-empty')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests — Empty bed suggestions
// ---------------------------------------------------------------------------

test.describe('Suggestions — empty bed', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
    await clearSuggestionEvents(request, householdId);
    await deleteAllPlantings(request);
    await deleteAllLocations(request);

    // Zone 2: firstFrost Oct 15
    await setHouseholdZone(request, householdId, 2);
    // Outdoor location (isIndoor defaults false)
    await createOutdoorLocation(request, householdId);
    // Spenat: amaranthaceae, directSow month 4-6, 40 days maturity — works in April
    const spenat = await getCropByName(request, 'Spenat');
    await request.post('/api/wishlist', { data: { householdId, cropId: spenat.id, kgPerWeek: 1 } });
  });

  test.fixme('bed card appears on suggestions page with crop options', async ({ page }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('bed-card').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('empty-bed-badge').first()).toBeVisible();
    await expect(page.getByTestId('crop-option').first()).toBeVisible();
  });

  test.fixme('dashboard widget shows bed summary', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The unified "Förslag" widget renders a top-5 flat list of suggestions.
    // Each row is a `suggestion-item` with the crop name, location, and a
    // type dot (empty vs succession). Asserting the widget + first item
    // covers the visible shape; the specific empty-bed badge from the old
    // per-bed-card layout no longer exists.
    await expect(page.getByTestId('suggestions-widget')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('suggestion-item').first()).toBeVisible();
  });

  test.fixme('dashboard widget links to suggestions page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('suggestions-widget')).toBeVisible({ timeout: 5000 });
    // Multiple links exist now (header "Visa alla" + one per suggestion row).
    // Any of them navigate to /suggestions, so we click the first.
    await page.getByTestId('suggestions-widget').getByRole('link').first().click();

    await expect(page).toHaveURL(/\/suggestions/, { timeout: 5000 });
  });

  test.fixme('accepting a crop option navigates to plantings with prefilled form', async ({ page }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('crop-option').first()).toBeVisible({ timeout: 5000 });
    await page.getByTestId('accept-btn').first().click();

    await expect(page).toHaveURL(/\/plantings/, { timeout: 5000 });
    await expect(page.getByTestId('planting-form')).toBeVisible({ timeout: 5000 });
  });

  test.fixme('dismissing a crop option removes it from the bed card', async ({ page }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('crop-option').first()).toBeVisible({ timeout: 5000 });
    const initialCount = await page.getByTestId('crop-option').count();

    await page.getByTestId('dismiss-btn').first().click();

    await expect(page.getByTestId('crop-option')).toHaveCount(Math.max(0, initialCount - 1), {
      timeout: 5000,
    });
  });

  test('how it works explainer is collapsible', async ({ page }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    // Initially hidden
    await expect(page.getByTestId('how-it-works-body')).not.toBeVisible();

    // Click toggle
    await page.getByTestId('how-it-works-toggle').click();
    await expect(page.getByTestId('how-it-works-body')).toBeVisible();

    // Click again to close
    await page.getByTestId('how-it-works-toggle').click();
    await expect(page.getByTestId('how-it-works-body')).not.toBeVisible();
  });

  test.fixme('clear-dismissals button is visible, and after dismissing + clearing, the crop reappears', async ({
    page,
  }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    // Button is always visible
    await expect(page.getByTestId('clear-dismissals-btn')).toBeVisible({ timeout: 5000 });

    // Dismiss the first crop option
    await expect(page.getByTestId('crop-option').first()).toBeVisible({ timeout: 5000 });
    const initialCount = await page.getByTestId('crop-option').count();
    await page.getByTestId('dismiss-btn').first().click();
    await expect(page.getByTestId('crop-option')).toHaveCount(Math.max(0, initialCount - 1), {
      timeout: 5000,
    });

    // Click the clear-dismissals button and confirm in the dialog
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('clear-dismissals-btn').click();

    // After clearing, suggestions are re-fetched and the dismissed crop reappears
    await expect(page.getByTestId('crop-option')).toHaveCount(initialCount, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Tests — Succession suggestions
// ---------------------------------------------------------------------------

test.describe('Suggestions — succession bed', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
    await clearSuggestionEvents(request, householdId);
    await deleteAllPlantings(request);
    await deleteAllLocations(request);

    await setHouseholdZone(request, householdId, 2);
    const locationId = await createOutdoorLocation(request, householdId);

    // Plant Spenat (amaranthaceae) with harvest ~6 weeks from today
    const spenat = await getCropByName(request, 'Spenat');
    const harvestDate = new Date();
    harvestDate.setDate(harvestDate.getDate() + 42);

    await request.post('/api/planting', {
      data: {
        cropId: spenat.id,
        locationId,
        plantedDate: new Date().toISOString().slice(0, 10),
        expectedHarvestDate: harvestDate.toISOString().slice(0, 10),
        areaM2: 5,
        status: 'planted',
      },
    });

    // Wishlist Rädisa (brassicaceae, different family, directSow month 4-7, 25 days maturity)
    const radisa = await getCropByName(request, 'Rädisa');
    await request.post('/api/wishlist', { data: { householdId, cropId: radisa.id, kgPerWeek: 1 } });
  });

  test.fixme('succession bed card shows current crop and frees-up date', async ({ page }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('bed-card').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('succession-badge').first()).toBeVisible();
    await expect(page.getByTestId('crop-option').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests — Calendar no longer shows suggestions
// ---------------------------------------------------------------------------

test.describe('Suggestions — calendar clean', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
    await clearSuggestionEvents(request, householdId);
    await deleteAllPlantings(request);
    await deleteAllLocations(request);

    await setHouseholdZone(request, householdId, 2);
    await createOutdoorLocation(request, householdId);
    const spenat = await getCropByName(request, 'Spenat');
    await request.post('/api/wishlist', { data: { householdId, cropId: spenat.id, kgPerWeek: 1 } });
  });

  test('calendar page does not show suggestions section', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('suggestions-section')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests — Seedling transplant suggestions
// ---------------------------------------------------------------------------

test.describe('Suggestions — seedling transplant', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
    await clearSuggestionEvents(request, householdId);
    await deleteAllPlantings(request);
    await deleteAllLocations(request);

    // Zone 2 (Stockholm): lastFrost = May 8
    await setHouseholdZone(request, householdId, 2);

    // Outdoor bed for the transplant target
    await createOutdoorLocation(request, householdId);

    // Indoor location holding the seedling
    const indoor = (await (
      await request.post('/api/location', {
        data: { name: 'Inomhus', areaM2: 1, householdId, isIndoor: true },
      })
    ).json()) as { id: number };

    // Tomat (solanaceae) — has weeksToTransplant set in seed data
    const tomato = await getCropByName(request, 'Tomat');

    // Seedling sown ~70 days before today so biology is ready by mid-May
    const sownDate = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await request.post('/api/planting', {
      data: {
        cropId: tomato.id,
        locationId: indoor.id,
        plantedDate: sownDate,
        areaM2: 0.2,
        status: 'seedling',
      },
    });

    await request.post('/api/wishlist', { data: { householdId, cropId: tomato.id, kgPerWeek: 1 } });
  });

  test.fixme('renders a distinct transplant option with the source seedling sow date', async ({
    page,
  }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('transplant-option').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('transplant-source-label').first()).toBeVisible();
  });

  test.fixme('accepting a transplant suggestion removes it from the bed card without navigation', async ({
    page,
  }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    const option = page.getByTestId('transplant-option').first();
    await expect(option).toBeVisible({ timeout: 5000 });

    await option.getByTestId('accept-btn').click();

    // Stays on /suggestions and the option goes away after accept
    await expect(page).toHaveURL(/\/suggestions/);
    await expect(page.getByTestId('transplant-option')).toHaveCount(0, { timeout: 5000 });
  });

  test.fixme('accepting surfaces a harden-off chip on the dashboard upcoming-events widget', async ({
    page,
  }) => {
    await page.goto('/suggestions');
    await page.waitForLoadState('networkidle');

    const option = page.getByTestId('transplant-option').first();
    await expect(option).toBeVisible({ timeout: 5000 });
    await option.getByTestId('accept-btn').click();
    await expect(page.getByTestId('transplant-option')).toHaveCount(0, { timeout: 5000 });

    // Visit the dashboard — a harden-off chip should now appear in the widget
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('harden-off-chip').first()).toBeVisible({ timeout: 5000 });
  });
});
