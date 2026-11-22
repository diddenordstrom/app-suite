import { test, expect } from '@playwright/test';

test.describe('Crop Library', () => {
  test('displays the page title', async ({ page }) => {
    await page.goto('/crops');

    await expect(page.locator('h1')).toHaveText('Grödbibliotek');
  });

  test('displays the search input', async ({ page }) => {
    await page.goto('/crops');

    await expect(page.locator('input[type="search"]')).toBeVisible();
  });

  test('displays category filter buttons', async ({ page }) => {
    await page.goto('/crops');

    await expect(page.getByRole('button', { name: 'Alla' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotfrukter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bladgrönsaker' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Baljväxter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Frukt & bär' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spannmål' })).toBeVisible();
  });

  test('displays seeded crop cards', async ({ page }) => {
    await page.goto('/crops');

    // Count grows as we expand the seeded crop library; assert "many" instead
    // of an exact number so this doesn't have to change every time.
    const cropCards = page.locator('[data-testid="crop-card"]');
    await expect(cropCards.first()).toBeVisible();
    const count = await cropCards.count();
    expect(count).toBeGreaterThanOrEqual(39);
  });

  test('displays crop count', async ({ page }) => {
    await page.goto('/crops');

    await expect(page.getByText(/\d+ grödor/)).toBeVisible();
  });

  test('crop card shows nutrition data', async ({ page }) => {
    await page.goto('/crops');

    // Use exact text match to avoid matching Färskpotatis
    const potatisCard = page.locator('[data-testid="crop-card"]').filter({
      has: page.getByText('Potatis', { exact: true }),
    });
    await expect(potatisCard).toBeVisible();
    await expect(potatisCard.getByText('4.5 kg/m²')).toBeVisible();
    await expect(potatisCard.getByText('810 kcal/kg')).toBeVisible();
    await expect(potatisCard.getByText('Rotfrukter')).toBeVisible();
  });

  test('search filters crops by name', async ({ page }) => {
    // Arrange
    await page.goto('/crops');
    // Wait for crops to load before interacting
    await expect(page.locator('[data-testid="crop-card"]').first()).toBeVisible();

    // Act
    await page.locator('input[type="search"]').fill('Rödbeta');

    // Assert
    const cropCards = page.locator('[data-testid="crop-card"]');
    await expect(cropCards).toHaveCount(1);
    await expect(cropCards.first()).toContainText('Rödbeta');
  });

  test('search is case-insensitive', async ({ page }) => {
    await page.goto('/crops');
    await expect(page.locator('[data-testid="crop-card"]').first()).toBeVisible();

    await page.locator('input[type="search"]').fill('rödbeta');

    const cropCards = page.locator('[data-testid="crop-card"]');
    await expect(cropCards).toHaveCount(1);
  });

  test('search with no match shows empty state', async ({ page }) => {
    await page.goto('/crops');
    await expect(page.locator('[data-testid="crop-card"]').first()).toBeVisible();

    await page.locator('input[type="search"]').fill('xyznonexistent');

    await expect(page.locator('[data-testid="crop-card"]')).toHaveCount(0);
  });

  test('category filter shows only matching crops', async ({ page }) => {
    // Arrange
    await page.goto('/crops');
    await expect(page.locator('[data-testid="crop-card"]').first()).toBeVisible();

    // Act
    await page.getByRole('button', { name: 'Spannmål' }).click();

    // Assert
    const cropCards = page.locator('[data-testid="crop-card"]');
    await expect(cropCards).toHaveCount(4);
    await expect(cropCards.nth(0)).toContainText('Spannmål');
    await expect(cropCards.nth(1)).toContainText('Spannmål');
  });

  test('clicking active category resets filter', async ({ page }) => {
    await page.goto('/crops');
    await expect(page.locator('[data-testid="crop-card"]').first()).toBeVisible();

    // Filter
    await page.getByRole('button', { name: 'Spannmål' }).click();
    await expect(page.locator('[data-testid="crop-card"]')).toHaveCount(4);

    // Reset — back to the full seeded crop library (count grows over time).
    await page.getByRole('button', { name: 'Spannmål' }).click();
    const cards = page.locator('[data-testid="crop-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(39);
  });

  test('search and category filter work together', async ({ page }) => {
    await page.goto('/crops');
    await expect(page.locator('[data-testid="crop-card"]').first()).toBeVisible();

    // Filter by fruit category
    await page.getByRole('button', { name: 'Frukt & bär' }).click();
    // Wait for filter to take effect
    await expect(page.locator('[data-testid="crop-card"]').first()).toBeVisible();
    // Then search within fruits
    await page.locator('input[type="search"]').fill('Gurka');

    const cropCards = page.locator('[data-testid="crop-card"]');
    await expect(cropCards).toHaveCount(1);
    await expect(cropCards.first()).toContainText('Gurka');
  });
});
