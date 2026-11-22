import { test, expect } from '@playwright/test';

/** Wait for the page's first data load to complete. */
async function waitForLocationsReady(page: import('@playwright/test').Page) {
  // networkidle waits for all API calls (triggered by onMounted) to finish,
  // ensuring the page has loaded and event handlers are attached.
  await page.waitForLoadState('networkidle');
}

test.describe('Locations page', () => {
  test('displays the page title', async ({ page }) => {
    await page.goto('/locations');

    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows empty state when no locations exist', async ({ page, request }) => {
    // Clean up plantings first (FK to locations) — service handles child FKs
    const plantings = await (await request.get('/api/planting')).json();
    for (const p of plantings) {
      await request.delete(`/api/planting/${p.id}`);
    }
    // Then clean up locations
    const locations = await (await request.get('/api/location')).json();
    for (const loc of locations) {
      await request.delete(`/api/location/${loc.id}`);
    }

    await page.goto('/locations');

    await expect(page.getByText(/no.*location|inga.*plats/i).first()).toBeVisible();
  });

  test('shows add button', async ({ page }) => {
    await page.goto('/locations');

    await expect(page.getByRole('button', { name: /add.*location|lägg till/i })).toBeVisible();
  });

  test('opens form when add button is clicked', async ({ page }) => {
    await page.goto('/locations');
    await waitForLocationsReady(page);

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();

    await expect(page.getByTestId('location-form')).toBeVisible();
    await expect(page.locator('input#name')).toBeVisible();
  });

  test('cancel button closes the form', async ({ page }) => {
    await page.goto('/locations');
    await waitForLocationsReady(page);

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await expect(page.getByTestId('location-form')).toBeVisible();

    await page.getByRole('button', { name: /cancel|avbryt/i }).click();
    await expect(page.getByTestId('location-form')).not.toBeVisible();
  });

  test('shows validation error for empty name', async ({ page }) => {
    await page.goto('/locations');
    await waitForLocationsReady(page);

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await expect(page.getByTestId('location-form')).toBeVisible();

    // Submit without filling
    await page
      .getByTestId('location-form')
      .getByRole('button', { name: /add.*location|lägg till plats/i })
      .click();

    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Locations CRUD', () => {
  test.beforeEach(async ({ request }) => {
    // Ensure a household exists
    const households = await (await request.get('/api/household')).json();
    if (households.length === 0) {
      await request.post('/api/household', {
        data: { name: 'Test Family', persons: 4, dailyKcalTarget: 8000 },
      });
    }
  });

  test('can create a new location and lands on the detail page', async ({ page, request }) => {
    await page.goto('/locations');
    await waitForLocationsReady(page);

    // Open form
    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await expect(page.getByTestId('location-form')).toBeVisible();

    // Fill form
    await page.locator('input#name').fill('Test Greenhouse');
    await page.locator('input#areaM2').fill('8.5');
    await page.locator('input#description').fill('Sunny spot');

    const countBefore = ((await (await request.get('/api/location')).json()) as unknown[]).length;

    // Submit — after create, navigate lands on /locations/[newId] detail page.
    await page
      .getByTestId('location-form')
      .getByRole('button', { name: /add.*location|lägg till plats/i })
      .click();

    // Assert — we're now on the detail page for the newly created location.
    await expect(page).toHaveURL(/\/locations\/\d+/);
    await expect(page.getByTestId('location-name')).toHaveText('Test Greenhouse');

    // Assert — server state has one more location than before.
    await expect
      .poll(async () => {
        const after = (await (await request.get('/api/location')).json()) as unknown[];
        return after.length;
      })
      .toBe(countBefore + 1);
  });

  test('shows total area when locations exist', async ({ page, request }) => {
    // Ensure at least one location
    const locations = await (await request.get('/api/location')).json();
    if (locations.length === 0) {
      const households = await (await request.get('/api/household')).json();
      await request.post('/api/location', {
        data: { householdId: households[0].id, name: 'Bed A', areaM2: 5.0 },
      });
    }

    await page.goto('/locations');

    await expect(page.getByText(/total.*area|total.*yta/i)).toBeVisible();
  });

  test('can edit a location from the detail page', async ({ page, request }) => {
    // Arrange — create a fresh location to edit
    const households = await (await request.get('/api/household')).json();
    const created = (await (
      await request.post('/api/location', {
        data: { householdId: households[0].id, name: 'Edit Me', areaM2: 3.0 },
      })
    ).json()) as { id: number };

    // Act — open the detail page, click Redigera, change the name, save
    await page.goto(`/locations/${created.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('location-detail-edit-btn').click();
    const editForm = page.getByTestId('location-edit-form');
    await expect(editForm).toBeVisible();

    await editForm.locator('input#edit-name').fill('Updated Name');
    await editForm.getByRole('button', { name: /update|uppdatera/i }).click();

    // Assert — dialog closes, the header reflects the new name, and the
    // persisted record was updated.
    await expect(editForm).not.toBeVisible();
    await expect(page.getByTestId('location-name')).toHaveText('Updated Name');
    await expect
      .poll(async () => {
        const fresh = (await (await request.get(`/api/location`)).json()) as {
          id: number;
          name: string;
        }[];
        return fresh.find((l) => l.id === created.id)?.name;
      })
      .toBe('Updated Name');
  });

  test('form shows isIndoor checkbox', async ({ page }) => {
    await page.goto('/locations');
    await waitForLocationsReady(page);

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await expect(page.getByTestId('location-form')).toBeVisible();

    await expect(page.locator('#isIndoor')).toBeVisible();
  });

  test('can create an indoor location and see the badge on the detail page', async ({ page }) => {
    await page.goto('/locations');
    await waitForLocationsReady(page);

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await page.locator('input#name').fill('Fönsterbräda');
    await page.locator('input#areaM2').fill('0.5');
    await page.locator('#isIndoor').check();

    await page
      .getByTestId('location-form')
      .getByRole('button', { name: /add.*location|lägg till plats/i })
      .click();

    // Lands on detail; indoor badge should be visible in the header
    await expect(page).toHaveURL(/\/locations\/\d+/);
    await expect(page.getByTestId('location-name')).toHaveText('Fönsterbräda');
    await expect(page.getByTestId('location-detail-indoor-badge')).toBeVisible();
  });

  test('can delete a location with no plantings from the detail page', async ({
    page,
    request,
  }) => {
    // Arrange — fresh household + location with no plantings
    const households = await (await request.get('/api/household')).json();
    const created = (await (
      await request.post('/api/location', {
        data: { householdId: households[0].id, name: 'Delete Me', areaM2: 1.0 },
      })
    ).json()) as { id: number };

    // Act — open detail → overflow menu → delete → confirm
    await page.goto(`/locations/${created.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('location-detail-overflow-btn').click();
    await page.getByTestId('location-detail-delete-btn').click();
    await page.getByTestId('confirm-delete-location').click();

    // Assert — navigates back to the list and the deleted location is gone
    await expect(page).toHaveURL(/\/locations\/?$/);
    const remaining = (await (await request.get('/api/location')).json()) as { id: number }[];
    expect(remaining.find((l) => l.id === created.id)).toBeUndefined();
  });

  test('deleting a location with plantings moves them to a target location', async ({
    page,
    request,
  }) => {
    // Arrange — two locations, with one planting in the source
    const households = await (await request.get('/api/household')).json();
    const householdId = households[0].id;
    const source = (await (
      await request.post('/api/location', {
        data: { householdId, name: 'Källa', areaM2: 4.0 },
      })
    ).json()) as { id: number };
    const target = (await (
      await request.post('/api/location', {
        data: { householdId, name: 'Mål', areaM2: 4.0 },
      })
    ).json()) as { id: number; name: string };

    const crops = (await (await request.get('/api/crops')).json()) as { id: number }[];
    const planting = (await (
      await request.post('/api/planting', {
        data: {
          cropId: crops[0].id,
          locationId: source.id,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
        },
      })
    ).json()) as { id: number };

    // Act — delete source with plantings, pick target
    await page.goto(`/locations/${source.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('location-detail-overflow-btn').click();
    await page.getByTestId('location-detail-delete-btn').click();
    // The move-target dropdown is the only combobox in the delete dialog.
    const moveTargetInput = page.getByRole('dialog').getByRole('combobox');
    await moveTargetInput.click();
    await moveTargetInput.fill(target.name);
    await moveTargetInput.press('Enter');
    await page.getByTestId('confirm-delete-location').click();

    // Assert — navigates back to list, source gone, planting now at target
    await expect(page).toHaveURL(/\/locations\/?$/);
    const remaining = (await (await request.get('/api/location')).json()) as { id: number }[];
    expect(remaining.find((l) => l.id === source.id)).toBeUndefined();
    const fresh = (await (await request.get(`/api/planting/${planting.id}`)).json()) as {
      locationId: number;
    };
    expect(fresh.locationId).toBe(target.id);
  });
});
