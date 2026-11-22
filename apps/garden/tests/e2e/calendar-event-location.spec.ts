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

async function firstCropId(request: APIRequestContext): Promise<{ id: number; name: string }> {
  const crops = (await (await request.get('/api/crops')).json()) as { id: number; name: string }[];
  return crops[0]!;
}

test.describe('Calendar — event card shows location + planting pills', () => {
  test('renders a location pill when the event has a locationId', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
    const locationName = 'Tunnel-1-rensa-ogras';
    const locationId = await ensureLocation(request, householdId, locationName);

    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Rensa ogräs',
        date: today,
        locationIds: [locationId],
        eventType: 'weeding',
      },
    });

    // Act
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Assert — location pill is rendered on the card.
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Rensa ogräs' });
    await expect(card.getByTestId('event-location-pill')).toContainText(locationName);
  });

  test('renders a planting pill (with crop name) when the event has a plantingId', async ({
    page,
    request,
  }) => {
    // Arrange — a location, a planting on it, and an event tagged to that planting.
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
    const locationName = 'Bed-with-planting';
    const locationId = await ensureLocation(request, householdId, locationName);
    const crop = await firstCropId(request);

    const today = new Date().toISOString().slice(0, 10);
    const planting = (await (
      await request.post('/api/planting', {
        data: {
          householdId,
          cropId: crop.id,
          locationId,
          plantedDate: today,
          areaM2: 1,
        },
      })
    ).json()) as { id: number };

    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Vattna',
        date: today,
        plantingIds: [planting.id],
        eventType: 'watering',
      },
    });

    // Act
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Assert — planting pill shows the crop name so user knows which planting.
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Vattna' });
    await expect(card.getByTestId('event-planting-pill')).toContainText(crop.name);
  });
});
