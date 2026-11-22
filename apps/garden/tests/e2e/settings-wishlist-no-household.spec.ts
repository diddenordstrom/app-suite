import { test, expect } from '@playwright/test';

test.describe('Settings — wishlist (no household)', () => {
  test('crop combobox is populated even when no household exists', async ({ page }) => {
    // Arrange — intercept /api/household to simulate fresh install (no household yet).
    await page.route('**/api/household', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, body: '[]' });
      } else {
        await route.continue();
      }
    });

    // Act
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const cropSelect = page.getByTestId('wishlist-crop-select');
    await cropSelect.getByRole('combobox').click();

    // Assert — at least one crop option appears in the dropdown.
    await expect(cropSelect.getByRole('option').first()).toBeVisible();
  });
});
