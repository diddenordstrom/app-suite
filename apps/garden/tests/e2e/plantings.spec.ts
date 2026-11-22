import { test, expect, type Page } from '@playwright/test';

/** Wait for the page's first data load to complete. */
async function waitForPlantingsReady(page: Page) {
  await page.waitForLoadState('networkidle');
}

/** SearchableCombobox helpers — pick a location by exact name match. */
async function selectLocationByName(page: Page, selector: string, name: string): Promise<void> {
  const trigger = page.locator(selector).getByRole('combobox');
  await trigger.click();
  await trigger.fill(name);
  // Click the filtered option rather than press Enter — more reliable under
  // reka-ui's Combobox primitives.
  await page
    .getByRole('option', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .click();
}

/** Pick a location by its position in the dropdown list (0-indexed). */
async function selectLocationByIndex(page: Page, selector: string, idx: number): Promise<void> {
  const trigger = page.locator(selector).getByRole('combobox');
  await trigger.click();
  await page.getByRole('option').nth(idx).click();
}

test.describe('Plantings page', () => {
  test('displays the page title', async ({ page }) => {
    await page.goto('/plantings');

    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows empty state when no plantings exist', async ({ page, request }) => {
    // Clean up all plantings first so empty state shows
    const plantings = await (await request.get('/api/planting')).json();
    for (const p of plantings) {
      await request.delete(`/api/planting/${p.id}`);
    }

    await page.goto('/plantings');

    await expect(page.getByText(/nothing planted|inget planterat/i).first()).toBeVisible();
  });

  test('shows add button', async ({ page }) => {
    await page.goto('/plantings');

    await expect(
      page.getByRole('button', { name: /add planting|lägg till odling/i }),
    ).toBeVisible();
  });

  test('opens form when add button is clicked @smoke', async ({ page }) => {
    await page.goto('/plantings');
    await waitForPlantingsReady(page);

    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();

    await expect(page.getByTestId('planting-form')).toBeVisible();
    await expect(page.getByTestId('crop-combobox')).toBeVisible();
    await expect(page.locator('#locationId')).toBeVisible();
    await expect(page.locator('input#plantedDate')).toBeVisible();
  });

  test('form has crop dropdown populated with seeded crops', async ({ page }) => {
    await page.goto('/plantings');
    await waitForPlantingsReady(page);
    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();

    const combobox = page.getByTestId('crop-combobox').getByRole('combobox');
    await combobox.click();

    // Should show crop options in the dropdown
    const options = page.getByTestId('crop-combobox').getByRole('option');
    await expect(options.first()).toBeVisible();
  });

  test('cancel button closes the form', async ({ page }) => {
    await page.goto('/plantings');
    await waitForPlantingsReady(page);

    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();
    await expect(page.getByTestId('planting-form')).toBeVisible();

    await page.getByRole('button', { name: /cancel|avbryt/i }).click();
    await expect(page.getByTestId('planting-form')).not.toBeVisible();
  });

  test('shows validation error when submitting empty form', async ({ page }) => {
    await page.goto('/plantings');
    await waitForPlantingsReady(page);

    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();
    await expect(page.getByTestId('planting-form')).toBeVisible();

    // Click the submit button inside the form
    await page
      .getByTestId('planting-form')
      .getByRole('button', { name: /add planting|lägg till odling/i })
      .click();

    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Plantings CRUD', () => {
  test.beforeEach(async ({ request }) => {
    // Ensure a location exists for planting
    const locations = await (await request.get('/api/location')).json();
    if (locations.length === 0) {
      // Need a household first
      const households = await (await request.get('/api/household')).json();
      let householdId: number;
      if (households.length === 0) {
        const hh = await (
          await request.post('/api/household', {
            data: { name: 'Test Family', persons: 4, dailyKcalTarget: 8000 },
          })
        ).json();
        householdId = hh.id;
      } else {
        householdId = households[0].id;
      }
      await request.post('/api/location', {
        data: { householdId, name: 'Test Bed', areaM2: 10.0 },
      });
    }
  });

  test('can create a new planting and see it in the list @smoke', async ({ page, request }) => {
    await page.goto('/plantings');
    await waitForPlantingsReady(page);

    // Open form
    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();
    await expect(page.getByTestId('planting-form')).toBeVisible();

    // Ensure area mode is active (household default may be 'count')
    await page.getByTestId('planting-mode-toggle').getByText(/m²/i).click();

    // Fill form — select first crop and first location
    await page.getByTestId('crop-combobox').getByRole('combobox').click();
    await page.getByTestId('crop-combobox').getByRole('option').first().click();
    await selectLocationByIndex(page, '#locationId', 0);
    await page.locator('input#plantedDate').fill('2026-04-01');
    await page.locator('input#areaM2').fill('2.5');

    const countBefore = ((await (await request.get('/api/planting')).json()) as unknown[]).length;

    // Submit — after create, navigate lands on /plantings/[newId] detail page.
    await page
      .getByTestId('planting-form')
      .getByRole('button', { name: /add planting|lägg till odling/i })
      .click();

    // Assert — we're now on the detail page for the newly created planting.
    await expect(page).toHaveURL(/\/plantings\/\d+/);
    await expect(page.getByTestId('planting-detail-crop-name')).toBeVisible();

    // Assert — server state has one more planting than before.
    await expect
      .poll(async () => {
        const after = (await (await request.get('/api/planting')).json()) as unknown[];
        return after.length;
      })
      .toBe(countBefore + 1);
  });

  test('can change planting status via dropdown on detail page', async ({ page, request }) => {
    // Ensure a planting exists
    const plantings = await (await request.get('/api/planting')).json();
    let plantingId: number;
    if (plantings.length === 0) {
      const crops = await (await request.get('/api/crops')).json();
      const locations = await (await request.get('/api/location')).json();
      const created = await (
        await request.post('/api/planting', {
          data: {
            cropId: crops[0].id,
            locationId: locations[0].id,
            plantedDate: '2026-04-01',
            areaM2: 2.0,
          },
        })
      ).json();
      plantingId = created.id;
    } else {
      const active = plantings.find(
        (p: { status: string }) => p.status === 'planted' || p.status === 'seedling',
      );
      plantingId = active?.id ?? plantings[0].id;
    }

    await page.goto(`/plantings/${plantingId}`);
    await page.waitForLoadState('networkidle');

    // Flip to seedling via the inline status dropdown on the detail page header
    const statusSelect = page.getByTestId('planting-detail-status-select');
    await statusSelect.click();
    await page.getByRole('option', { name: /förkultur|seedling|frøplante/i }).click();

    await expect(statusSelect).toContainText(/förkultur|seedling|frøplante/i);
  });

  test('defaults status to seedling when an indoor location is selected', async ({
    page,
    request,
  }) => {
    // Arrange — make sure both an outdoor and an indoor location exist.
    const households = await (await request.get('/api/household')).json();
    const householdId = households[0].id;
    const existingLocations = await (await request.get('/api/location')).json();
    if (!existingLocations.some((l: { isIndoor: boolean }) => l.isIndoor)) {
      await request.post('/api/location', {
        data: { householdId, name: 'Fönsterbräda', areaM2: 0.5, isIndoor: true },
      });
    }
    const locations = await (await request.get('/api/location')).json();
    const indoorLocation = locations.find((l: { isIndoor: boolean }) => l.isIndoor);
    expect(indoorLocation).toBeTruthy();

    // Wipe existing plantings so the card we assert on is the new one.
    const existing = await (await request.get('/api/planting')).json();
    for (const p of existing) {
      await request.delete(`/api/planting/${p.id}`);
    }

    // Act — create a planting in the indoor location through the form.
    await page.goto('/plantings');
    await waitForPlantingsReady(page);
    await page.getByRole('button', { name: /add planting|lägg till odling/i }).click();
    await expect(page.getByTestId('planting-form')).toBeVisible();

    await page.getByTestId('planting-mode-toggle').getByText(/m²/i).click();
    await page.getByTestId('crop-combobox').getByRole('combobox').click();
    await page.getByTestId('crop-combobox').getByRole('option').first().click();
    await selectLocationByName(page, '#locationId', indoorLocation.name);
    await page.locator('input#plantedDate').fill('2026-04-01');
    await page.locator('input#areaM2').fill('0.3');

    await page
      .getByTestId('planting-form')
      .getByRole('button', { name: /add planting|lägg till odling/i })
      .click();

    // Assert — after create we navigate to /plantings/[newId] detail page.
    await expect(page).toHaveURL(/\/plantings\/\d+/);

    // Assert — the resulting planting row was tagged seedling, so the
    // transplant suggestion engine will pick it up.
    const created = await (await request.get('/api/planting')).json();
    const newPlanting = created.find(
      (p: { locationId: number }) => p.locationId === indoorLocation.id,
    );
    expect(newPlanting).toBeTruthy();
    expect(newPlanting.status).toBe('seedling');
  });

  test('can update the location of an existing planting', async ({ page, request }) => {
    // Arrange — make sure two locations exist so we can switch between them
    const households = await (await request.get('/api/household')).json();
    const householdId = households[0].id;
    const locationsBefore = await (await request.get('/api/location')).json();
    if (locationsBefore.length < 2) {
      await request.post('/api/location', {
        data: { householdId, name: 'Polytunneln', areaM2: 8.0 },
      });
    }
    const locations = await (await request.get('/api/location')).json();
    const [firstLocation, secondLocation] = locations;

    // Wipe existing plantings so the card we interact with is deterministic
    const existing = await (await request.get('/api/planting')).json();
    for (const p of existing) {
      await request.delete(`/api/planting/${p.id}`);
    }

    // Create a single planting in the first location
    const crops = await (await request.get('/api/crops')).json();
    const created = await (
      await request.post('/api/planting', {
        data: {
          cropId: crops[0].id,
          locationId: firstLocation.id,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          status: 'planted',
        },
      })
    ).json();

    // Act — open the detail page for that planting, click Redigera, change
    // the location in the edit dialog, save.
    await page.goto(`/plantings/${created.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('planting-detail-edit-btn').click();
    const editForm = page.getByTestId('planting-edit-form');
    await expect(editForm).toBeVisible();
    await selectLocationByName(page, '#edit-locationId', secondLocation.name);
    await editForm.getByRole('button', { name: /update|uppdatera/i }).click();

    // Assert — dialog closes and the persisted record reflects the new location
    await expect(editForm).not.toBeVisible();
    await expect
      .poll(async () => {
        const fresh = await (await request.get(`/api/planting/${created.id}`)).json();
        return fresh.locationId;
      })
      .toBe(secondLocation.id);
  });

  test('can delete a planting from the detail page', async ({ page, request }) => {
    // Create a fresh planting to delete
    const crops = await (await request.get('/api/crops')).json();
    const locations = await (await request.get('/api/location')).json();
    const created = await (
      await request.post('/api/planting', {
        data: {
          cropId: crops[0].id,
          locationId: locations[0].id,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
        },
      })
    ).json();

    // Open detail → overflow menu → delete → confirm
    await page.goto(`/plantings/${created.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('planting-detail-overflow-btn').click();
    await page.getByTestId('planting-detail-delete-btn').click();
    await page.getByTestId('confirm-delete-planting').click();

    // Assert — navigate back to the list and the deleted planting is gone.
    await expect(page).toHaveURL(/\/plantings\/?$/);
    const remaining = (await (await request.get('/api/planting')).json()) as { id: number }[];
    expect(remaining.find((p) => p.id === created.id)).toBeUndefined();
  });
});
