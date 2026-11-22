import { test, expect } from '@playwright/test';

test.describe('Navigation — general', () => {
  test('loads the dashboard @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('crops page is accessible directly @smoke', async ({ page }) => {
    await page.goto('/crops');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows version in header only on settings page', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');
    await expect(header.getByTestId('app-version')).not.toBeVisible();

    await page.goto('/settings');
    const versionBadge = header.getByTestId('app-version');
    await expect(versionBadge).toBeVisible();
    await expect(versionBadge).toHaveText(/build: [a-z0-9]{3,}/);
  });
});

test.describe('Navigation — mobile bottom nav', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('shows 4 items in bottom nav', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByTestId('bottom-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a')).toHaveCount(4);
  });

  test('bottom nav contains dashboard, plantings, locations, calendar', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByTestId('bottom-nav');
    await expect(nav.locator('a[href="/"]')).toBeVisible();
    await expect(nav.locator('a[href="/plantings"]')).toBeVisible();
    await expect(nav.locator('a[href="/locations"]')).toBeVisible();
    await expect(nav.locator('a[href="/calendar"]')).toBeVisible();
  });

  test('storage is NOT in bottom nav', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByTestId('bottom-nav');
    await expect(nav.locator('a[href="/storage"]')).not.toBeAttached();
  });

  test('hamburger button is visible on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('hamburger-btn')).toBeVisible();
  });
});

test.describe('Navigation — mobile side nav', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('side nav opens when hamburger is clicked', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('hamburger-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('side nav contains garden, storage, crops, seeds, settings', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('hamburger-btn').click();
    const nav = page.getByTestId('sidenav-sheet');
    await expect(nav.locator('a[href="/garden"]')).toBeVisible();
    await expect(nav.locator('a[href="/storage"]')).toBeVisible();
    await expect(nav.locator('a[href="/crops"]')).toBeVisible();
    await expect(nav.locator('a[href="/seeds"]')).toBeVisible();
    await expect(nav.locator('a[href="/settings"]')).toBeVisible();
  });

  test('navigates to storage via side nav', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('hamburger-btn').click();
    await page.getByTestId('sidenav-sheet').locator('a[href="/storage"]').click();
    await expect(page).toHaveURL('/storage');
  });

  test('navigates to settings via side nav', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('hamburger-btn').click();
    await page.getByTestId('sidenav-sheet').locator('a[href="/settings"]').click();
    await expect(page).toHaveURL('/settings');
  });
});

test.describe('Navigation — desktop sidebar', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('bottom nav is hidden on desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('bottom-nav')).not.toBeVisible();
  });

  test('hamburger button is hidden on desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('hamburger-btn')).not.toBeVisible();
  });

  test('desktop sidebar shows all nav items', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar.locator('a[href="/"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/plantings"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/storage"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/calendar"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/garden"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/locations"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/crops"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/seeds"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/settings"]')).toBeVisible();
  });

  test('navigates to locations via desktop sidebar', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('sidebar-nav').locator('a[href="/locations"]').click();
    await expect(page).toHaveURL('/locations');
  });
});
