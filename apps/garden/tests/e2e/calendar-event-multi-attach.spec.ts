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

test.describe('Calendar — multi-attach event via form', () => {
  test('card shows a counter pill (📍 N) when an event has 2+ locations, opens modal on click', async ({
    page,
    request,
  }) => {
    // Arrange — event tagged to two locations via the API.
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
    const locA = await ensureLocation(request, householdId, 'Counter-A');
    const locB = await ensureLocation(request, householdId, 'Counter-B');

    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Vattna multi',
        date: today,
        locationIds: [locA, locB],
        eventType: 'watering',
      },
    });

    // Act
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Assert — counter pill (not a name pill).
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Vattna multi' });
    const pill = card.getByTestId('event-location-pill');
    await expect(pill).toContainText('2');
    await expect(pill).not.toContainText('Counter-A');

    // Click the pill → modal opens with both locations as chips.
    await pill.click();
    const picker = page.getByTestId('event-locations-picker');
    await expect(picker.getByTestId('selected-chip')).toHaveCount(2);
  });

  test('add two locations to a new event and they round-trip as chips', async ({
    page,
    request,
  }) => {
    // Arrange — two named locations to pick from.
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
    await ensureLocation(request, householdId, 'Multi-A');
    await ensureLocation(request, householdId, 'Multi-B');

    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Act — open the form, fill required fields, pick TWO locations.
    await page.getByRole('button', { name: /lägg till händelse|add event/i }).click();
    await expect(page.getByTestId('garden-event-form')).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input#title').fill('Vattna allt');
    await page.locator('input#date').fill(today);

    const locationPicker = page.getByTestId('event-locations-picker');
    // First selection
    await locationPicker.getByRole('combobox').click();
    await locationPicker.getByRole('option', { name: 'Multi-A', exact: true }).click();
    // Second selection
    await locationPicker.getByRole('combobox').click();
    await locationPicker.getByRole('option', { name: 'Multi-B', exact: true }).click();

    // Both names should now appear as chips in the form picker.
    await expect(locationPicker.getByTestId('selected-chip')).toHaveCount(2);
    await expect(
      locationPicker.getByTestId('selected-chip').filter({ hasText: 'Multi-A' }),
    ).toBeVisible();
    await expect(
      locationPicker.getByTestId('selected-chip').filter({ hasText: 'Multi-B' }),
    ).toBeVisible();

    // Save
    await page
      .getByTestId('garden-event-form')
      .getByRole('button', { name: /lägg till|spara|save/i })
      .click();
    await page.waitForLoadState('networkidle');

    // Re-open the same event via the edit pencil → both chips should still be there.
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Vattna allt' });
    await card.getByTestId('edit-event').click();
    await expect(page.getByTestId('garden-event-form')).toBeVisible();
    const reopenedPicker = page.getByTestId('event-locations-picker');
    await expect(reopenedPicker.getByTestId('selected-chip')).toHaveCount(2);
  });
});
