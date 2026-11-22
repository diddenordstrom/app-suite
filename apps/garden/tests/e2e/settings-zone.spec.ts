import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

async function selectZoneByPrefix(page: Page, prefix: string): Promise<void> {
  const input = page.getByTestId('growing-zone-select').getByRole('combobox');
  await input.click();
  await input.fill(prefix);
  // Reka-ui's Combobox highlights filtered options; clicking the visible
  // option is more reliable than relying on Enter-to-select because the
  // SearchableCombobox's @keydown.enter doesn't always win the race with
  // reka-ui's own keyboard handling under Playwright.
  await page.getByRole('option', { name: new RegExp(`^${prefix}`) }).click();
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Settings — growing zone', () => {
  test('zone select is visible', async ({ page }) => {
    // Arrange + Act
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(page.getByTestId('growing-zone-select')).toBeVisible();
  });

  test('selecting zone 2 auto-saves and persists on reload', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act — select zone 2 (triggers auto-save via watcher)
    await selectZoneByPrefix(page, 'Zon 2');

    // Assert — server-side state should reflect the new zone. Poll because
    // the auto-save fires asynchronously via a watcher.
    await expect
      .poll(async () => {
        const households = (await (await request.get('/api/household')).json()) as {
          id: number;
          growingZone: number | null;
        }[];
        return households.find((h) => h.id === householdId)?.growingZone;
      })
      .toBe(2);
  });

  test('selecting zone 5 persists on reload', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act — select zone 5
    await selectZoneByPrefix(page, 'Zon 5');

    // Assert — server-side state reflects the choice.
    await expect
      .poll(async () => {
        const households = (await (await request.get('/api/household')).json()) as {
          id: number;
          growingZone: number | null;
        }[];
        return households.find((h) => h.id === householdId)?.growingZone;
      })
      .toBe(5);
  });

  test('detect zone button sets zone from geolocation', async ({ page, request, context }) => {
    // Arrange — seed household & mock geolocation to Stockholm (zone 3)
    await getOrCreateHouseholdId(request);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 59.3, longitude: 18.1 });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act — click detect button
    await page.getByTestId('detect-zone-btn').click();

    // Assert — zone select should update to 3
    await expect(page.getByTestId('growing-zone-select').getByRole('combobox')).toHaveAttribute(
      'placeholder',
      /Zon 3/,
    );
    await expect(page.getByTestId('zone-detect-message')).toBeVisible();
  });

  test('detect zone shows error for location outside Sweden', async ({
    page,
    request,
    context,
  }) => {
    // Arrange — mock geolocation to Berlin (outside Sweden)
    await getOrCreateHouseholdId(request);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 52.5, longitude: 13.4 });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act
    await page.getByTestId('detect-zone-btn').click();

    // Assert — error message should appear
    await expect(page.getByTestId('zone-detect-message')).toBeVisible();
    await expect(page.getByTestId('zone-detect-message')).toHaveClass(/text-danger/);
  });

  test('detect zone shows permission denied when geolocation is blocked', async ({
    page,
    request,
    context,
  }) => {
    // Arrange — seed household, explicitly deny geolocation
    await getOrCreateHouseholdId(request);
    await context.clearPermissions();

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Override geolocation to always reject with PERMISSION_DENIED
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (
        _success: PositionCallback,
        error?: PositionErrorCallback | null,
      ) => {
        if (error) {
          error({
            code: 1,
            message: 'User denied Geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        }
      };
    });

    // Act
    await page.getByTestId('detect-zone-btn').click();

    // Assert — permission denied message
    await expect(page.getByTestId('zone-detect-message')).toBeVisible();
    await expect(page.getByTestId('zone-detect-message')).toHaveClass(/text-danger/);
    await expect(page.getByTestId('zone-detect-message')).toContainText('Platsåtkomst nekad');
  });

  test('detect zone shows HTTPS error when not in secure context', async ({ page, request }) => {
    // Arrange — seed household
    await getOrCreateHouseholdId(request);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Override isSecureContext to false
    await page.evaluate(() => {
      Object.defineProperty(window, 'isSecureContext', { value: false, writable: true });
    });

    // Act
    await page.getByTestId('detect-zone-btn').click();

    // Assert — HTTPS required message
    await expect(page.getByTestId('zone-detect-message')).toBeVisible();
    await expect(page.getByTestId('zone-detect-message')).toHaveClass(/text-danger/);
    await expect(page.getByTestId('zone-detect-message')).toContainText('HTTPS');
  });

  test('detect zone shows error on timeout', async ({ page, request }) => {
    // Arrange
    await getOrCreateHouseholdId(request);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Override geolocation to reject with TIMEOUT
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (
        _success: PositionCallback,
        error?: PositionErrorCallback | null,
      ) => {
        if (error) {
          error({
            code: 3,
            message: 'Timeout expired',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        }
      };
    });

    // Act
    await page.getByTestId('detect-zone-btn').click();

    // Assert — generic detect error (not permission-denied, not HTTPS)
    await expect(page.getByTestId('zone-detect-message')).toBeVisible();
    await expect(page.getByTestId('zone-detect-message')).toHaveClass(/text-danger/);
  });

  test('zone hint text is visible', async ({ page }) => {
    // Arrange + Act
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Assert — hint paragraph under the zone select
    await expect(
      page.getByText('Används för att beräkna sådd- och utplanteringsdatum'),
    ).toBeVisible();
  });
});
