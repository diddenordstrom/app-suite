import { test, expect, type APIRequestContext } from '@playwright/test';

async function getOrCreateHouseholdId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0].id;
  const created = (await (
    await request.post('/api/household', { data: { name: 'Test Family', persons: 4 } })
  ).json()) as { id: number };
  return created.id;
}

async function clearWishlist(request: APIRequestContext, householdId: number): Promise<void> {
  const res = await request.get(`/api/wishlist?householdId=${householdId}`);
  if (!res.ok()) return;
  const entries = (await res.json()) as { id: number }[];
  for (const entry of entries) {
    await request.delete(`/api/wishlist/${entry.id}`);
  }
}

test.describe('Settings — wishlist Enter-key flow', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
  });

  test('two Enter presses select a crop and add it to the wishlist with demand', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const cropSelect = page.getByTestId('wishlist-crop-select');
    const input = cropSelect.getByRole('combobox');

    // Act — open dropdown, type, first Enter selects the filtered option.
    await input.click();
    await input.fill('Morot');
    await input.press('Enter');

    // Demand is now required before add succeeds.
    await page.getByTestId('wishlist-add-kg-per-week').fill('1');

    // Second Enter submits.
    await input.press('Enter');
    await page.waitForLoadState('networkidle');

    // Assert — Morötter chip appears.
    await expect(page.getByTestId('wishlist-chip').filter({ hasText: 'Morötter' })).toBeVisible();
  });
});
