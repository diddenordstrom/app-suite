import { test, expect } from '@playwright/test';

test.describe('Garden Map', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure household exists
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    const nameInput = page.locator('input#household-name');
    const currentValue = await nameInput.inputValue();
    if (!currentValue) {
      await nameInput.fill('Testfamiljen');
      await nameInput.blur();
      const personsInput = page.locator('input#household-persons');
      await personsInput.fill('2');
      await personsInput.blur();
      await page.waitForLoadState('networkidle');
    }
  });

  test('navigates to garden page via desktop sidebar', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar.locator('a[href="/garden"]')).toBeVisible();
    await sidebar.locator('a[href="/garden"]').click();
    await expect(page).toHaveURL('/garden');
  });

  test('garden page is accessible directly', async ({ page }) => {
    await page.goto('/garden');
    await page.waitForLoadState('networkidle');
    // Should show either setup dialog or canvas
    const hasSetup = await page
      .getByRole('dialog')
      .isVisible()
      .catch(() => false);
    const hasCanvas = await page
      .getByTestId('garden-canvas')
      .isVisible()
      .catch(() => false);
    expect(hasSetup || hasCanvas).toBe(true);
  });

  test('shows setup dialog when no garden exists', async ({ page }) => {
    // Delete any existing garden first
    await page.goto('/garden');
    await page.waitForLoadState('networkidle');

    // If a canvas is visible, the garden already exists — skip this test
    const hasCanvas = await page
      .getByTestId('garden-canvas')
      .isVisible()
      .catch(() => false);
    if (hasCanvas) {
      test.skip();
      return;
    }

    // Setup dialog should be visible
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input#garden-width')).toBeVisible();
    await expect(dialog.locator('input#garden-height')).toBeVisible();
    await expect(dialog.locator('input#garden-cell-size')).toBeVisible();
  });

  test('creates a garden and shows canvas', async ({ page }) => {
    await page.goto('/garden');
    await page.waitForLoadState('networkidle');

    // If garden already exists, skip
    const hasCanvas = await page
      .getByTestId('garden-canvas')
      .isVisible()
      .catch(() => false);
    if (hasCanvas) {
      test.skip();
      return;
    }

    // Fill setup form
    const dialog = page.getByRole('dialog');
    await dialog.locator('input#garden-name').fill('Test trädgård');
    await dialog.locator('input#garden-width').fill('5');
    await dialog.locator('input#garden-height').fill('3');

    // Submit
    await dialog.getByRole('button', { name: /skapa|create/i }).click();

    // Canvas should now be visible
    await expect(page.getByTestId('garden-canvas')).toBeVisible();
  });

  test('shows toolbar with mode toggle', async ({ page }) => {
    // First ensure garden exists
    await page.goto('/garden');
    await page.waitForLoadState('networkidle');

    const hasCanvas = await page
      .getByTestId('garden-canvas')
      .isVisible()
      .catch(() => false);
    if (!hasCanvas) {
      // Create a garden
      const dialog = page.getByRole('dialog');
      await dialog.locator('input#garden-width').fill('5');
      await dialog.locator('input#garden-height').fill('3');
      await dialog.getByRole('button', { name: /skapa|create/i }).click();
      await expect(page.getByTestId('garden-canvas')).toBeVisible();
    }

    // Toolbar should show mode buttons
    await expect(page.getByRole('button', { name: /visa|view/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /måla|paint/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sudda|erase/i })).toBeVisible();
  });

  test('garden layout uses full-bleed (no max-width constraint)', async ({ page }) => {
    await page.goto('/garden');
    await page.waitForLoadState('networkidle');

    // The garden page should not have the max-w-2xl constraint
    const main = page.locator('main');
    const mainClass = await main.getAttribute('class');
    expect(mainClass).not.toContain('max-w-2xl');
  });
});

test.describe('Garden Map — mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('hamburger is visible on garden page', async ({ page }) => {
    await page.goto('/garden');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('hamburger-btn')).toBeVisible();
  });
});
