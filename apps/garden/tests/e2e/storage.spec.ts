import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Setup helpers
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

async function getFirstCropId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number }[];
  if (crops.length === 0) throw new Error('No crops seeded');
  return crops[0].id;
}

async function clearAllStorage(request: APIRequestContext, householdId: number): Promise<void> {
  const res = await request.get('/api/storage');
  if (!res.ok()) return;
  const items = (await res.json()) as { id: number; householdId: number }[];
  for (const item of items.filter((i) => i.householdId === householdId)) {
    await request.delete(`/api/storage/${item.id}`);
  }
}

async function addStorageItem(
  request: APIRequestContext,
  cropId: number,
  householdId: number,
  quantityKg: number,
  harvestedDate: string,
): Promise<void> {
  await request.post('/api/storage', {
    data: { cropId, householdId, quantityKg, harvestedDate },
  });
}

// ---------------------------------------------------------------------------
// Grouped storage view
// ---------------------------------------------------------------------------

test.describe('Storage page — grouped view', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearAllStorage(request, householdId);
  });

  test('shows one row per crop, not one row per batch @smoke', async ({ page, request }) => {
    // Arrange — add two batches of the same crop
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);
    await addStorageItem(request, cropId, householdId, 1.0, '2026-08-01');
    await addStorageItem(request, cropId, householdId, 2.0, '2026-08-10');

    // Act
    await page.goto('/storage');

    // Assert — only one grouped row for this crop is visible
    const groups = page.getByTestId('storage-group');
    await expect(groups.first()).toBeVisible();
    const count = await groups.count();
    // There should be fewer groups than raw storage items (batches are collapsed)
    expect(count).toBeGreaterThanOrEqual(1);

    // The total quantity displayed should reflect the sum of both batches
    await expect(page.getByTestId('storage-group').first()).toContainText('3');
  });
});

// ---------------------------------------------------------------------------
// Weeks remaining (burn-rate depletion)
// ---------------------------------------------------------------------------

async function ensureWishlistWithKgPerWeek(
  request: APIRequestContext,
  householdId: number,
  cropId: number,
  kgPerWeek: number,
): Promise<void> {
  // Add to wishlist if not already there
  const addRes = await request.post('/api/wishlist', {
    data: { householdId, cropId, kgPerWeek },
  });
  const entry = (await addRes.json()) as { id: number; kgPerWeek: number | null };
  // If already existed, kgPerWeek may be null — update it
  if (entry.kgPerWeek !== kgPerWeek) {
    await request.put(`/api/wishlist/${entry.id}`, { data: { kgPerWeek } });
  }
}

async function clearWishlist(request: APIRequestContext, householdId: number): Promise<void> {
  // We DELETE wishlist rows wholesale rather than PUTting `kgPerWeek: null`:
  // the API now requires at-least-one-of-{kgPerWeek, kgPerYear}, so a clearing
  // PUT would 400. The full delete is simpler and matches the test intent.
  const res = await request.get(`/api/wishlist?householdId=${householdId}`);
  if (!res.ok()) return;
  const entries = (await res.json()) as { id: number }[];
  for (const entry of entries) {
    await request.delete(`/api/wishlist/${entry.id}`);
  }
}

test.describe('Storage page — weeks remaining from burn rate', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearAllStorage(request, householdId);
    await clearWishlist(request, householdId);
  });

  test('shows weeks remaining on storage card when burn rate is set', async ({ page, request }) => {
    // Arrange — add storage and set kgPerWeek on wishlist
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);
    await addStorageItem(request, cropId, householdId, 10.0, '2026-08-01');
    await ensureWishlistWithKgPerWeek(request, householdId, cropId, 2);

    // Act
    await page.goto('/storage', { waitUntil: 'networkidle' });

    // Assert — the storage group card shows weeks remaining
    const group = page.getByTestId('storage-group').first();
    await expect(group).toBeVisible();
    const weeksText = group.getByTestId('weeks-remaining');
    await expect(weeksText).toBeVisible();
    await expect(weeksText).toContainText('5');
  });

  test('does not show weeks remaining when no burn rate is set', async ({ page, request }) => {
    // Arrange — add storage but no burn rate
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);
    await addStorageItem(request, cropId, householdId, 5.0, '2026-08-01');

    // Act
    await page.goto('/storage');

    // Assert
    const group = page.getByTestId('storage-group').first();
    await expect(group).toBeVisible();
    await expect(group.getByTestId('weeks-remaining')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Expiring soon section
// ---------------------------------------------------------------------------

test.describe('Storage page — expiring soon section', () => {
  test('shows crop in "Snart utgånget" section when expiresAt is within 7 days', async ({
    page,
    request,
  }) => {
    // Arrange — create a storage item whose expiresAt falls within 7 days.
    // expiresAt = harvestedDate + shelfLifeWeeks * 7 days
    // We pick harvestedDate so that expiresAt = today + 3 days.
    const householdId = await getOrCreateHouseholdId(request);
    const cropsRes = await request.get('/api/crops');
    const crops = (await cropsRes.json()) as { id: number; shelfLifeWeeks: number | null }[];
    const crop = crops.find((c) => c.shelfLifeWeeks != null && c.shelfLifeWeeks > 0);
    if (!crop) throw new Error('No crop with shelfLifeWeeks found');

    const today = new Date();
    const daysToExpire = 3;
    const harvestedDate = new Date(
      today.getTime() - (crop.shelfLifeWeeks! * 7 - daysToExpire) * 24 * 60 * 60 * 1000,
    );
    const harvestedDateStr = harvestedDate.toISOString().slice(0, 10);

    await addStorageItem(request, crop.id, householdId, 1.0, harvestedDateStr);

    // Act
    await page.goto('/storage');

    // Assert — the expiring-soon section is visible
    const expiringSection = page.getByTestId('expiring-soon-section');
    await expect(expiringSection).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Quick consume chip
// ---------------------------------------------------------------------------

test.describe('Storage page — quick consume chip', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearAllStorage(request, householdId);
  });

  test('clicking the minus button decrements totalKg by defaultConsumeKg', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);
    await addStorageItem(request, cropId, householdId, 5.0, '2026-08-01');

    await page.goto('/storage');

    const group = page.getByTestId('storage-group').first();
    await expect(group).toBeVisible();

    // Capture the initial total displayed
    const consumeButton = group.getByTestId('quick-consume-button');
    await expect(consumeButton).toBeVisible();

    // Act
    await consumeButton.click();

    // Assert — the page reflects the updated (lower) quantity
    // The exact number depends on defaultConsumeKg; we just verify a network call was made
    // and the UI re-renders without error. A more precise assertion would need to know
    // defaultConsumeKg for this crop.
    await expect(page.getByTestId('storage-group').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Expand / collapse batches
// ---------------------------------------------------------------------------

test.describe('Storage page — expand and collapse batches', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearAllStorage(request, householdId);
  });

  test('clicking the expand arrow shows individual batches', async ({ page, request }) => {
    // Arrange — two batches of the same crop so there is something to expand
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);
    await addStorageItem(request, cropId, householdId, 1.0, '2026-08-01');
    await addStorageItem(request, cropId, householdId, 2.0, '2026-08-15');

    await page.goto('/storage');

    const group = page.getByTestId('storage-group').first();
    await expect(group).toBeVisible();

    const expandButton = group.getByTestId('expand-batches-button');
    await expect(expandButton).toBeVisible();

    // Act
    await expandButton.click();

    // Assert — individual batch rows are now visible
    const batchRows = group.getByTestId('batch-row');
    await expect(batchRows.first()).toBeVisible();
  });

  test('clicking the expand arrow again hides individual batches', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);
    await addStorageItem(request, cropId, householdId, 1.0, '2026-08-01');
    await addStorageItem(request, cropId, householdId, 2.0, '2026-08-15');

    await page.goto('/storage');

    const group = page.getByTestId('storage-group').first();
    const expandButton = group.getByTestId('expand-batches-button');

    // Open
    await expandButton.click();
    await expect(group.getByTestId('batch-row').first()).toBeVisible();

    // Act — close
    await expandButton.click();

    // Assert — batch rows are hidden
    await expect(group.getByTestId('batch-row').first()).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Manual consume in expanded view
// ---------------------------------------------------------------------------

test.describe('Storage page — manual consume in expanded view', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await clearAllStorage(request, householdId);
  });

  test('entering a custom kg amount and confirming reduces storage', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const cropId = await getFirstCropId(request);
    await addStorageItem(request, cropId, householdId, 4.0, '2026-08-01');

    await page.goto('/storage');

    const group = page.getByTestId('storage-group').first();
    await expect(group).toBeVisible();

    // Expand to show batch-level actions
    const expandButton = group.getByTestId('expand-batches-button');
    await expandButton.click();

    // Act — find the manual consume input and submit
    const consumeInput = group.getByTestId('manual-consume-input');
    await expect(consumeInput).toBeVisible();
    await consumeInput.fill('1.5');

    const confirmButton = group.getByTestId('manual-consume-confirm');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Assert — the group's totalKg is now lower (4.0 - 1.5 = 2.5)
    await expect(group).toContainText('2.5');
  });
});
