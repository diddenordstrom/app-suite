import { test, expect, type APIRequestContext } from '@playwright/test';

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

async function clearWishlist(request: APIRequestContext, householdId: number): Promise<void> {
  const res = await request.get(`/api/wishlist?householdId=${householdId}`);
  const rows = (await res.json()) as { id: number }[];
  for (const row of rows) {
    await request.delete(`/api/wishlist/${row.id}`);
  }
}

async function getCropIdByName(request: APIRequestContext, name: string): Promise<number> {
  const crops = (await (await request.get('/api/crops')).json()) as {
    id: number;
    name: string;
  }[];
  const match = crops.find((c) => c.name === name);
  if (!match) throw new Error(`Seed crop "${name}" not found`);
  return match.id;
}

test.describe('Dashboard — per-crop self-sufficiency detail @smoke', () => {
  test('expanding the self-sufficiency card reveals per-crop progress bars', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
    const tomatId = await getCropIdByName(request, 'Tomat');
    await request.post('/api/wishlist', {
      data: { householdId, cropId: tomatId, kgPerWeek: 1 },
    });

    // Act
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert — collapsed by default, list hidden
    const card = page.getByTestId('dashboard-self-sufficiency-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('self-sufficiency-detail-list')).toBeHidden();

    // Act — expand
    await page.getByTestId('self-sufficiency-expand-toggle').click();

    // Assert — list visible, Tomat row rendered with progress meter
    const list = page.getByTestId('self-sufficiency-detail-list');
    await expect(list).toBeVisible();
    const tomatRow = list.getByTestId(`self-sufficiency-crop-${tomatId}`);
    await expect(tomatRow).toBeVisible();
    await expect(tomatRow).toContainText(/tomat/i);
  });
});
