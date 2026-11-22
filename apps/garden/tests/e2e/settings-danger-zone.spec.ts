import { test, expect, type APIRequestContext } from '@playwright/test';

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

test.describe('Settings — danger zone', () => {
  test('danger zone section is visible', async ({ page }) => {
    // Arrange + Act
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(page.getByTestId('danger-zone-section')).toBeVisible();
  });

  test('reset button is disabled when confirmation phrase is empty', async ({ page }) => {
    // Arrange + Act
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(page.getByTestId('reset-confirm-btn')).toBeDisabled();
  });

  test('reset button is disabled when wrong phrase is typed', async ({ page }) => {
    // Arrange
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act
    await page.getByTestId('reset-confirm-input').fill('wrong phrase');

    // Assert
    await expect(page.getByTestId('reset-confirm-btn')).toBeDisabled();
  });

  test('reset button enables when correct phrase is typed', async ({ page }) => {
    // Arrange
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act — type the Swedish confirmation phrase (default locale)
    await page.getByTestId('reset-confirm-input').fill('Jag hatar växter!');

    // Assert
    await expect(page.getByTestId('reset-confirm-btn')).toBeEnabled();
  });

  test('clicking reset clears data and shows success message', async ({ page, request }) => {
    // Arrange — ensure there is some data to clear
    const householdId = await getOrCreateHouseholdId(request);
    await request.post('/api/location', {
      data: { householdId, name: 'Test Bed', areaM2: 10 },
    });
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act
    await page.getByTestId('reset-confirm-input').fill('Jag hatar växter!');
    await page.getByTestId('reset-confirm-btn').click();

    // Assert — success message shown
    await expect(page.getByTestId('reset-message')).toBeVisible({ timeout: 5000 });

    // Assert — locations are gone
    const locRes = await request.get('/api/location');
    const locations = (await locRes.json()) as unknown[];
    expect(locations).toHaveLength(0);
  });
});
