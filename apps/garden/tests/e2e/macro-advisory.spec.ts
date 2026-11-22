import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateHouseholdId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0]!.id;

  const created = (await (
    await request.post('/api/household', {
      data: { name: 'Test Family', persons: 2 },
    })
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

async function getCropByName(
  request: APIRequestContext,
  name: string,
): Promise<{ id: number; name: string }> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number; name: string }[];
  const crop = crops.find((c) => c.name === name);
  if (!crop) throw new Error(`Crop "${name}" not found`);
  return crop;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Macro advisory', () => {
  let householdId: number;

  test.beforeEach(async ({ request }) => {
    householdId = await getOrCreateHouseholdId(request);
    await clearWishlist(request, householdId);
  });

  test('API rejects wishlist add without demand (incomplete nudge legacy-only)', async ({
    request,
  }) => {
    // The "incomplete nudge" tier of the macro advisory now exists only to
    // cover legacy DB rows from before demand validation existed. New wishlist
    // entries must include kgPerWeek or kgPerYear — the API responds 400
    // otherwise, so we can't trigger the nudge via the public surface anymore.
    const potatis = await getCropByName(request, 'Potatis');
    await request.post('/api/wishlist', {
      data: { householdId, cropId: potatis.id, kgPerWeek: 2 },
    });
    const morötter = await getCropByName(request, 'Morötter');
    const noDemandRes = await request.post('/api/wishlist', {
      data: { householdId, cropId: morötter.id },
    });
    expect(noDemandRes.status()).toBe(400);
  });

  test('shows macro gap advisory with suggestions when all kgPerWeek filled', async ({
    page,
    request,
  }) => {
    // Arrange — add crop with kgPerWeek (only potatis = low fat)
    const potatis = await getCropByName(request, 'Potatis');
    await request.post('/api/wishlist', {
      data: { householdId, cropId: potatis.id, kgPerWeek: 2 },
    });

    // Act
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Assert — gap advisory visible with suggestions
    await expect(page.getByTestId('macro-advisory-gap')).toBeVisible();
    await expect(page.getByTestId('macro-advisory-suggestion').first()).toBeVisible();
  });

  test('clicking a suggestion adds it to the wishlist', async ({ page, request }) => {
    // Arrange
    const potatis = await getCropByName(request, 'Potatis');
    await request.post('/api/wishlist', {
      data: { householdId, cropId: potatis.id, kgPerWeek: 2 },
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Count chips before
    const chipsBefore = await page.getByTestId('wishlist-chip').count();

    // Act — click first suggestion
    await page.getByTestId('macro-advisory-suggestion').first().click();

    // Assert — new chip appeared. Use toHaveCount so Playwright auto-retries
    // until the re-render settles (the click triggers a POST plus a
    // macro-advisory reload; on slower CI hardware a snapshot count can race
    // the DOM update).
    await expect(page.getByTestId('wishlist-chip')).toHaveCount(chipsBefore + 1, { timeout: 5000 });
  });

  test('shows no advisory when wishlist is empty', async ({ page }) => {
    // Act
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(page.getByTestId('macro-advisory')).not.toBeVisible();
  });

  test('dashboard shows macro tip in self-sufficiency card', async ({ page, request }) => {
    // Arrange — add crop with kgPerWeek
    const potatis = await getCropByName(request, 'Potatis');
    await request.post('/api/wishlist', {
      data: { householdId, cropId: potatis.id, kgPerWeek: 2 },
    });

    // Act
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(page.getByTestId('dashboard-macro-tip')).toBeVisible();
  });

  test('no dashboard tip when no wishlist gap', async ({ page }) => {
    // Arrange — empty wishlist, no advisory

    // Act
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(page.getByTestId('dashboard-macro-tip')).not.toBeVisible();
  });
});
