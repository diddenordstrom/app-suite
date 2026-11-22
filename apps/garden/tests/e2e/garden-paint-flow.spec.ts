import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the deferred-commit paint flow + the click-only popover
 * trigger. Both fixes share a setup (a garden must exist) so they live in one
 * spec.
 */

async function ensureHousehold(page: Page) {
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
}

async function ensureGarden(page: Page) {
  await page.goto('/garden');
  await page.waitForLoadState('networkidle');

  const hasCanvas = await page
    .getByTestId('garden-canvas')
    .isVisible()
    .catch(() => false);

  if (!hasCanvas) {
    const dialog = page.getByRole('dialog');
    await dialog.locator('input#garden-width').fill('5');
    await dialog.locator('input#garden-height').fill('3');
    await dialog.getByRole('button', { name: /skapa|create/i }).click();
    await expect(page.getByTestId('garden-canvas')).toBeVisible();
  }
}

/**
 * Paint a horizontal stroke at a known in-grid location. We deliberately
 * paint near the canvas's top-left (offset 150px) rather than centre: with
 * a 5m × 3m default garden at 10cm cells and zoom 1, the grid only covers
 * the first 500×300px of the canvas. The canvas element itself can be much
 * larger (full-bleed flex-1), in which case the centre lands OUTSIDE the
 * grid and `isInBounds` rejects every cell.
 */
async function paintStroke(page: Page, fromOffset: number, toOffset: number) {
  const canvas = page.getByTestId('garden-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  // y = 250 hits row ~25 in default garden — below the toolbar's top-4 spot
  // and inside the grid (rows 0-29). x base = 150 hits col 15.
  const xBase = box.x + 150;
  const y = box.y + 250;
  await page.mouse.move(xBase + fromOffset, y);
  await page.mouse.down();
  await page.mouse.move(xBase + toOffset, y, { steps: 6 });
  await page.mouse.up();
}

test.describe('Garden — deferred-commit paint flow', () => {
  test.beforeEach(async ({ page }) => {
    await ensureHousehold(page);
    await ensureGarden(page);
  });

  test('paint mode shows floating actions and hides toolbar; cancel restores it', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /måla|paint/i }).click();

    await paintStroke(page, 0, 40);

    // The most direct signal of "painting registered" is the floating action
    // bar appearing. Check that FIRST so a failure here gives a clearer cause
    // than the toolbar-hidden assertion below.
    await expect(page.getByTestId('garden-pending-actions')).toBeVisible();
    await expect(page.getByTestId('garden-pending-commit')).toBeVisible();
    await expect(page.getByTestId('garden-pending-cancel')).toBeVisible();

    // Toolbar mode-toggle should be removed by v-if (DOM-detached, not just hidden)
    await expect(page.getByRole('button', { name: /^visa$|^view$/i })).toHaveCount(0);

    // Cancel → toolbar comes back, pending actions vanish
    await page.getByTestId('garden-pending-cancel').click();
    await expect(page.getByTestId('garden-pending-actions')).toBeHidden();
    await expect(page.getByRole('button', { name: /^visa$|^view$/i })).toBeVisible();
  });

  test('commit opens the tag sheet (does not auto-open on release)', async ({ page }) => {
    await page.getByRole('button', { name: /måla|paint/i }).click();

    await paintStroke(page, 0, 30);

    // Pending actions appear → the tag sheet is NOT open yet
    await expect(page.getByTestId('garden-pending-actions')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Clicking ✓ opens the sheet
    await page.getByTestId('garden-pending-commit').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
