import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateHouseholdId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0].id;
  const created = (await (
    await request.post('/api/household', { data: { name: 'Test Family', persons: 4 } })
  ).json()) as { id: number };
  return created.id;
}

async function deleteAllGardenEvents(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const res = await request.get(`/api/garden-event?householdId=${householdId}`);
  if (!res.ok()) return;
  const events = (await res.json()) as { id: number }[];
  for (const event of events) {
    await request.delete(`/api/garden-event/${event.id}`);
  }
}

async function ensureLocation(
  request: APIRequestContext,
  householdId: number,
  name: string,
): Promise<number> {
  const locations = (await (await request.get('/api/location')).json()) as {
    id: number;
    name: string;
  }[];
  const existing = locations.find((l) => l.name === name);
  if (existing) return existing.id;
  const created = (await (
    await request.post('/api/location', {
      data: { householdId, name, areaM2: 4.0 },
    })
  ).json()) as { id: number };
  return created.id;
}

async function ensurePlanting(
  request: APIRequestContext,
  householdId: number,
  locationId: number,
): Promise<number> {
  const crops = (await (await request.get('/api/crops')).json()) as { id: number }[];
  const cropId = crops[0]!.id;
  const created = (await (
    await request.post('/api/planting', {
      data: {
        householdId,
        cropId,
        locationId,
        plantedDate: new Date().toISOString().slice(0, 10),
        areaM2: 1.0,
      },
    })
  ).json()) as { id: number };
  return created.id;
}

// ---------------------------------------------------------------------------
// (a) 2 locations + 3 plantings → counter pills with correct testids
// ---------------------------------------------------------------------------

test.describe('Calendar — multi-location counter pills', () => {
  test('(a) event with 2 locations and 3 plantings shows 📍 2 and 🌱 3 counter pills with count testids @smoke', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);

    const locA = await ensureLocation(request, householdId, 'ML-Loc-A');
    const locB = await ensureLocation(request, householdId, 'ML-Loc-B');
    const locC = await ensureLocation(request, householdId, 'ML-Loc-C');

    const p1 = await ensurePlanting(request, householdId, locA);
    const p2 = await ensurePlanting(request, householdId, locA);
    const p3 = await ensurePlanting(request, householdId, locA);

    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Multi-event-ABC',
        date: today,
        locationIds: [locA, locB],
        plantingIds: [p1, p2, p3],
        eventType: 'watering',
      },
    });

    // Act
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Assert — location counter pill shows "2"
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Multi-event-ABC' });
    const locPill = card.getByTestId('event-location-pill');
    await expect(locPill).toBeVisible();
    const locCount = locPill.getByTestId('event-location-count');
    await expect(locCount).toBeVisible();
    await expect(locCount).toContainText('2');

    // Assert — planting counter pill shows "3"
    const plantPill = card.getByTestId('event-planting-pill');
    await expect(plantPill).toBeVisible();
    const plantCount = plantPill.getByTestId('event-planting-count');
    await expect(plantCount).toBeVisible();
    await expect(plantCount).toContainText('3');

    // Cleanup
    await request.delete(`/api/planting/${p1}`);
    await request.delete(`/api/planting/${p2}`);
    await request.delete(`/api/planting/${p3}`);
    // unused location not strictly needed to clean up, but keep DB lean
    void locC;
  });

  // ---------------------------------------------------------------------------
  // (b) Click counter pill → edit modal opens with arrays pre-filled
  // ---------------------------------------------------------------------------

  test('(b) clicking the counter pill opens the edit modal with both locations as chips', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);

    const locA = await ensureLocation(request, householdId, 'ML-Click-A');
    const locB = await ensureLocation(request, householdId, 'ML-Click-B');

    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Multi-click-event',
        date: today,
        locationIds: [locA, locB],
        eventType: 'watering',
      },
    });

    // Act
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Multi-click-event' });
    await card.getByTestId('event-location-pill').click();

    // Assert — edit modal opens and the locations picker shows 2 chips
    await expect(page.getByTestId('garden-event-form')).toBeVisible();
    const locationPicker = page.getByTestId('event-locations-picker');
    await expect(locationPicker.getByTestId('selected-chip')).toHaveCount(2);
  });

  // ---------------------------------------------------------------------------
  // (c) Single location → name pill (no event-location-count testid)
  // ---------------------------------------------------------------------------

  test('(c) event with 1 location shows the location name pill (no counter testid)', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);

    const locA = await ensureLocation(request, householdId, 'ML-Single-Loc');

    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Single-location-event',
        date: today,
        locationIds: [locA],
        eventType: 'weeding',
      },
    });

    // Act
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Assert — pill shows the location name (not a count)
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Single-location-event' });
    const locPill = card.getByTestId('event-location-pill');
    await expect(locPill).toBeVisible();
    await expect(locPill).toContainText('ML-Single-Loc');
    // No counter testid should be present for a single location
    await expect(locPill.getByTestId('event-location-count')).not.toBeVisible();
  });
});
