import { test, expect } from '@playwright/test';

test.describe('Household setup', () => {
  test('displays the household form fields', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.locator('input#household-name')).toBeVisible();
    await expect(page.locator('input#household-persons')).toBeVisible();
    await expect(page.locator('#language')).toBeVisible();
  });

  test('auto-saves household on input blur', async ({ page }) => {
    // Arrange
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Act — fill name and blur to trigger auto-save
    const nameInput = page.locator('input#household-name');
    await nameInput.fill('Testfamiljen');
    await nameInput.blur();

    // Fill persons and blur
    const personsInput = page.locator('input#household-persons');
    await personsInput.fill('3');
    await personsInput.blur();

    // Assert — reload and verify persisted values
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input#household-name')).toHaveValue('Testfamiljen');
    await expect(page.locator('input#household-persons')).toHaveValue('3');
  });
});
