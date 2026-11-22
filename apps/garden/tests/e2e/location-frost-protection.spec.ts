import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureHousehold(request: APIRequestContext): Promise<number> {
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

async function cleanupLocation(request: APIRequestContext, id: number): Promise<void> {
  await request.delete(`/api/location/${id}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Create form — frost-protection dropdown
// ---------------------------------------------------------------------------

test.describe('Location create form — frost protection', () => {
  test.beforeEach(async ({ request }) => {
    await ensureHousehold(request);
  });

  test('frost-protection dropdown is visible when create form opens', async ({ page }) => {
    await page.goto('/locations');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await expect(page.getByTestId('location-form')).toBeVisible();

    await expect(page.getByTestId('frost-protection-select')).toBeVisible();
  });

  test('defaults to open ground (frostBufferC = 0)', async ({ page }) => {
    await page.goto('/locations');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await expect(page.getByTestId('location-form')).toBeVisible();

    // Default selected value is open ground (frostBufferC = 0)
    await expect(page.getByTestId('frost-protection-select')).toContainText(/öppen mark/i);
  });

  test('creates location with Polytunnel (frostBufferC = 3) and persists it', async ({
    page,
    request,
  }) => {
    await page.goto('/locations');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add.*location|lägg till/i }).click();
    await expect(page.getByTestId('location-form')).toBeVisible();

    await page.locator('input#name').fill('Mitt Polytunnel');
    await page.locator('input#areaM2').fill('12.0');
    await page.getByTestId('frost-protection-select').click();
    await page.getByRole('option', { name: /polytunnel/i }).click();

    await page
      .getByTestId('location-form')
      .getByRole('button', { name: /add.*location|lägg till plats/i })
      .click();

    // Redirected to detail page
    await expect(page).toHaveURL(/\/locations\/\d+/);
    await expect(page.getByTestId('location-name')).toHaveText('Mitt Polytunnel');

    // Verify the API persisted frostBufferC = 3
    const locations = (await (await request.get('/api/location')).json()) as {
      id: number;
      name: string;
      frostBufferC: number;
    }[];
    const created = locations.find((l) => l.name === 'Mitt Polytunnel');
    expect(created).toBeDefined();
    expect(created!.frostBufferC).toBe(3);

    // Cleanup
    await cleanupLocation(request, created!.id);
  });
});

// ---------------------------------------------------------------------------
// Edit dialog — frost-protection dropdown
// ---------------------------------------------------------------------------

test.describe('Location edit dialog — frost protection', () => {
  let locationId: number;

  test.beforeEach(async ({ request }) => {
    const householdId = await ensureHousehold(request);

    const created = (await (
      await request.post('/api/location', {
        data: { householdId, name: 'Testbädd', areaM2: 4.0, frostBufferC: 3 },
      })
    ).json()) as { id: number };

    locationId = created.id;
  });

  test.afterEach(async ({ request }) => {
    await cleanupLocation(request, locationId);
  });

  test('edit dialog pre-selects correct protection level from stored frostBufferC', async ({
    page,
  }) => {
    // Location was created with frostBufferC = 3 (Polytunnel)
    await page.goto(`/locations/${locationId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('location-detail-edit-btn').click();
    await expect(page.getByTestId('location-edit-form')).toBeVisible();

    // Dropdown should show Polytunnel (frostBufferC = 3)
    await expect(page.getByTestId('edit-frost-protection-select')).toContainText(/polytunnel/i);
  });

  test('changing protection level in edit dialog persists the new frostBufferC', async ({
    page,
    request,
  }) => {
    await page.goto(`/locations/${locationId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('location-detail-edit-btn').click();
    await expect(page.getByTestId('location-edit-form')).toBeVisible();

    // Change from Polytunnel (3) to Greenhouse (5)
    await page.getByTestId('edit-frost-protection-select').click();
    await page.getByRole('option', { name: /växthus/i }).click();
    await page
      .getByTestId('location-edit-form')
      .getByRole('button', { name: /update|uppdatera/i })
      .click();

    await expect(page.getByTestId('location-edit-form')).not.toBeVisible();

    // Verify persistence
    await expect
      .poll(async () => {
        const loc = (await (await request.get(`/api/location/${locationId}`)).json()) as {
          frostBufferC: number;
        };
        return loc.frostBufferC;
      })
      .toBe(5);
  });

  test('existing location with frostBufferC = 0 shows open ground in edit dialog', async ({
    page,
    request,
  }) => {
    const householdId = await ensureHousehold(request);
    const legacy = (await (
      await request.post('/api/location', {
        data: { householdId, name: 'Gammal bädd', areaM2: 2.0 },
      })
    ).json()) as { id: number };

    await page.goto(`/locations/${legacy.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('location-detail-edit-btn').click();
    await expect(page.getByTestId('location-edit-form')).toBeVisible();

    // Should show open ground (frostBufferC = 0)
    await expect(page.getByTestId('edit-frost-protection-select')).toContainText(/öppen mark/i);

    await page
      .getByTestId('location-edit-form')
      .getByRole('button', { name: /cancel|avbryt/i })
      .click();

    await cleanupLocation(request, legacy.id);
  });
});
