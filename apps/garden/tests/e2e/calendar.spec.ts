import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
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

async function deleteAllGardenEvents(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const res = await request.get(`/api/garden-event?householdId=${householdId}`);
  if (!res.ok()) return;

  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return;

  const events = body as { id: number }[];
  for (const event of events) {
    await request.delete(`/api/garden-event/${event.id}`);
  }
}

/** Wait for the page's first data load to complete. */
async function waitForCalendarReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Calendar page loads
// ---------------------------------------------------------------------------

test.describe('Calendar page', () => {
  test('loads at /calendar', async ({ page }) => {
    // Arrange + Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Assert
    await expect(page).toHaveURL('/calendar');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows a page heading in Swedish', async ({ page }) => {
    // Arrange + Act
    await page.goto('/calendar');

    // Assert — heading text is the Swedish i18n key for calendar
    await expect(page.locator('h1')).toContainText('Trädgårdskalender');
  });
});

// ---------------------------------------------------------------------------
// Timeline section headings
// ---------------------------------------------------------------------------

test.describe('Calendar timeline sections', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
  });

  test('shows "Idag" section heading when an event exists for today', async ({ page, request }) => {
    // Arrange — create event for today's date
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Vattna idag', date: today },
    });

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Assert — use heading role to avoid matching event text containing "idag"
    await expect(page.getByRole('heading', { name: 'Idag' })).toBeVisible();
  });

  test('shows "Denna vecka" section heading when an event exists this week', async ({
    page,
    request,
  }) => {
    // Arrange — create event 3 days from now (within the same week)
    const householdId = await getOrCreateHouseholdId(request);
    const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Vattna om tre dagar', date: threeDays },
    });

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Assert
    await expect(page.getByRole('heading', { name: 'Denna vecka' })).toBeVisible();
  });

  test('shows "Snart" section heading when an event exists within 30 days', async ({
    page,
    request,
  }) => {
    // Arrange — create event 14 days from now
    const householdId = await getOrCreateHouseholdId(request);
    const fourteenDays = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Gödsla om fjorton dagar', date: fourteenDays },
    });

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Assert — use heading role to avoid matching event text containing "snart"
    await expect(page.getByRole('heading', { name: 'Snart' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Adding an event via FAB
// ---------------------------------------------------------------------------

test.describe('Calendar — add event', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
  });

  test('shows FAB button to add an event', async ({ page }) => {
    // Arrange + Act
    await page.goto('/calendar');

    // Assert — FAB is visible (aria-label "Lägg till händelse")
    await expect(page.getByRole('button', { name: /lägg till händelse|add event/i })).toBeVisible();
  });

  test('clicking FAB opens the event form', async ({ page }) => {
    // Arrange
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Act
    await page.getByRole('button', { name: /lägg till händelse|add event/i }).click();

    // Assert — form is visible with title and date inputs
    await expect(page.getByTestId('garden-event-form')).toBeVisible();
    await expect(page.locator('input#title')).toBeVisible();
    await expect(page.locator('input#date')).toBeVisible();
  });

  test('filling form and submitting adds event to the list', async ({ page }) => {
    // Arrange
    await page.goto('/calendar');
    await waitForCalendarReady(page);
    await page.getByRole('button', { name: /lägg till händelse|add event/i }).click();
    await expect(page.getByTestId('garden-event-form')).toBeVisible();

    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Act
    await page.locator('input#title').fill('Vattna gurkan');
    await page.locator('input#date').fill(futureDate);
    await page
      .getByTestId('garden-event-form')
      .getByRole('button', { name: /lägg till|spara|save/i })
      .click();

    // Assert — event title appears in the list
    await expect(page.getByText('Vattna gurkan')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Completing an event
// ---------------------------------------------------------------------------

test.describe('Calendar — complete event', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
  });

  test('clicking checkbox on an event marks it as completed (green)', async ({ page, request }) => {
    // Arrange — create an event for today so it appears in the list
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Vattna för test', date: today },
    });

    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Act — find the event card and click its complete checkbox
    const eventCard = page.getByTestId('garden-event-card').filter({ hasText: 'Vattna för test' });
    await eventCard.getByRole('checkbox').click();

    // Assert — checkbox becomes checked after completion
    await expect(eventCard.getByRole('checkbox')).toBeChecked();
  });

  test('completing a recurring event causes a new occurrence to appear in the list', async ({
    page,
    request,
  }) => {
    // Arrange — create a recurring event for today
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Vattna återkommande', date: today, recurringDays: 7 },
    });

    await page.goto('/calendar');
    await waitForCalendarReady(page);

    const eventCard = page
      .getByTestId('garden-event-card')
      .filter({ hasText: 'Vattna återkommande' });
    const countBefore = await page.getByTestId('garden-event-card').count();

    // Act
    await eventCard.getByRole('checkbox').click();

    // Assert — a new occurrence card appears (count increased by 1)
    await expect(page.getByTestId('garden-event-card')).toHaveCount(countBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — typed events / chore catalog
// ---------------------------------------------------------------------------

test.describe('Calendar — typed events', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
  });

  test('quick-add buttons exist for the chore catalog', async ({ page }) => {
    // Arrange + Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Assert — every chore type in the catalog has a dedicated quick-add
    // button so common chores are one tap, not five form fields.
    for (const type of ['watering', 'fertilizing', 'pruning', 'weeding', 'pest_check']) {
      await expect(page.getByTestId(`quick-add-${type}`)).toBeVisible();
    }
  });

  test('quick-add for watering pre-fills the form with eventType=watering', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Act — tap the watering quick-add, fill the date, submit. Title is
    // pre-filled by the quick-add itself; the user only confirms.
    await page.getByTestId('quick-add-watering').click();
    await expect(page.getByTestId('garden-event-form')).toBeVisible();
    await page.locator('input#date').fill(today);
    await page
      .getByTestId('garden-event-form')
      .getByRole('button', { name: /add|lägg till/i })
      .click();

    // Assert — the row shows up tagged with the watering chip and the API
    // round-trip persisted eventType=watering.
    const card = page.getByTestId('garden-event-card').filter({ hasText: /vattning|watering|💧/i });
    await expect(card).toBeVisible();
    await expect(card.getByTestId('event-type-chip-watering')).toBeVisible();

    const events = (await (
      await request.get(`/api/garden-event?householdId=${householdId}`)
    ).json()) as { eventType: string }[];
    expect(events.some((e) => e.eventType === 'watering')).toBe(true);
  });

  test('event-type chip is hidden for general events (no chip clutter)', async ({
    page,
    request,
  }) => {
    // Arrange — generic untyped event
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Random todo', date: today },
    });

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Assert — no chip for the general/default event type.
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Random todo' });
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid^="event-type-chip-"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 2a — edit / delete / notes / planting-dropdown bug
// ---------------------------------------------------------------------------

test.describe('Calendar — edit / delete / notes', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
  });

  test('edit button on an event card opens the form pre-filled with that event', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Original titel', date: today, eventType: 'fertilizing' },
    });

    await page.goto('/calendar');
    await waitForCalendarReady(page);

    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Original titel' });
    // Act
    await card.getByTestId('edit-event').click();

    // Assert — form opens with the title pre-filled
    await expect(page.getByTestId('garden-event-form')).toBeVisible();
    await expect(page.locator('input#title')).toHaveValue('Original titel');
    await expect(page.locator('#eventType')).toContainText(/gödsling/i);
  });

  test('saving the edit updates the existing row in place (no duplicate created)', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Förlåt mig', date: today },
    });

    await page.goto('/calendar');
    await waitForCalendarReady(page);

    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Förlåt mig' });
    await card.getByTestId('edit-event').click();
    await expect(page.getByTestId('garden-event-form')).toBeVisible();

    // Act
    await page.locator('input#title').fill('Tack och hej');
    await page
      .getByTestId('garden-event-form')
      .getByRole('button', { name: /spara|save|uppdater/i })
      .click();

    // Assert — exactly one card has the updated title (no duplicate spawned)
    // and the original title is gone. Other cards (harvests, suggestions) are
    // unrelated and may exist independently of this test, so filter by text.
    await expect(
      page.getByTestId('garden-event-card').filter({ hasText: 'Tack och hej' }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId('garden-event-card').filter({ hasText: 'Förlåt mig' }),
    ).toHaveCount(0);
  });

  test('delete button removes the event after confirmation', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Delete mig', date: today },
    });

    await page.goto('/calendar');
    await waitForCalendarReady(page);
    page.on('dialog', (d) => d.accept());

    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Delete mig' });

    // Act
    await card.getByTestId('delete-event').click();

    // Assert
    await expect(page.getByText('Delete mig')).toHaveCount(0);
  });

  test('notes from the description field render as a second line on the card', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Vattna gurkan',
        date: today,
        description: 'Endast på morgonen, undvik bladen',
      },
    });

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);

    // Assert
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Vattna gurkan' });
    await expect(card).toContainText('Endast på morgonen, undvik bladen');
  });
});

test.describe('Calendar — Phase 3 filters', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
  });

  test('filter type=watering hides events of other types', async ({ page, request }) => {
    // Arrange — one watering, one fertilizing
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Vattning idag', date: today, eventType: 'watering' },
    });
    await request.post('/api/garden-event', {
      data: { householdId, title: 'Gödsling idag', date: today, eventType: 'fertilizing' },
    });

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);
    await page.getByTestId('filter-type').click();
    await page.getByRole('option', { name: /^vattning$/i }).click();

    // Assert
    await expect(page.getByText('Vattning idag')).toBeVisible();
    await expect(page.getByText('Gödsling idag')).toHaveCount(0);
  });

  test('filter type+hideCompleted persist in the URL', async ({ page }) => {
    // Arrange + Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);
    await page.getByTestId('filter-type').click();
    await page.getByRole('option', { name: /beskärning/i }).click();
    await page.locator('input[data-testid="filter-hide-completed"]').check();

    // Assert
    await expect(page).toHaveURL(/type=pruning/);
    await expect(page).toHaveURL(/hide_completed=1/);
  });

  test('hideCompleted=true filters out events with completedAt set', async ({ page, request }) => {
    // Arrange — create + complete an event for today
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    const created = (await (
      await request.post('/api/garden-event', {
        data: { householdId, title: 'Klar redan', date: today, eventType: 'watering' },
      })
    ).json()) as { id: number };
    await request.post(`/api/garden-event/${created.id}/complete`);

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);
    // Without filter, the completed row is visible
    await expect(page.getByText('Klar redan')).toBeVisible();
    // Toggle on
    await page.locator('input[data-testid="filter-hide-completed"]').check();

    // Assert — disappears when hidden
    await expect(page.getByText('Klar redan')).toHaveCount(0);
  });
});

test.describe('Location detail — last-done card', () => {
  test('shows the most recent completed chore date per type', async ({ page, request }) => {
    // Arrange
    const households = (await (await request.get('/api/household')).json()) as { id: number }[];
    const householdId = households[0]!.id;
    let locations = (await (await request.get('/api/location')).json()) as {
      id: number;
      name: string;
    }[];
    if (locations.length === 0) {
      await request.post('/api/location', {
        data: { householdId, name: 'Phase 3 last-done bed', areaM2: 4.0 },
      });
      locations = (await (await request.get('/api/location')).json()) as {
        id: number;
        name: string;
      }[];
    }
    const locationId = locations[0]!.id;

    const created = (await (
      await request.post('/api/garden-event', {
        data: {
          householdId,
          title: 'Watered yesterday',
          date: '2026-04-15',
          locationIds: [locationId],
          eventType: 'watering',
        },
      })
    ).json()) as { id: number };
    await request.post(`/api/garden-event/${created.id}/complete`);

    // Act
    await page.goto(`/locations/${locationId}`);
    await page.waitForLoadState('networkidle');

    // Assert
    const card = page.getByTestId('last-done-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('last-done-watering')).toContainText('2026-04-15');
  });
});

test.describe('Calendar — RRULE recurrence picker', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
  });

  test('picking "Every weekday" persists the right RRULE on the row', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await page.goto('/calendar');
    await waitForCalendarReady(page);
    await page.getByRole('button', { name: /lägg till händelse|add event/i }).click();
    await expect(page.getByTestId('garden-event-form')).toBeVisible();

    // Act
    await page.locator('input#title').fill('Vardagschore');
    await page.locator('input#date').fill(today);
    await page.locator('#recurrencePreset').click();
    await page.getByRole('option', { name: /vardag/i }).click();
    await page
      .getByTestId('garden-event-form')
      .getByRole('button', { name: /lägg till|spara|save/i })
      .click();

    // Assert — server stored the RFC-5545 rule the picker generates.
    await expect(page.getByText('Vardagschore')).toBeVisible();
    const events = (await (
      await request.get(`/api/garden-event?householdId=${householdId}`)
    ).json()) as { recurrenceRule: string | null; title: string }[];
    const created = events.find((e) => e.title === 'Vardagschore');
    expect(created?.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  test('editing an event with FREQ=WEEKLY pre-selects "Every week" in the picker', async ({
    page,
    request,
  }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/garden-event', {
      data: {
        householdId,
        title: 'Veckochore',
        date: today,
        recurrenceRule: 'FREQ=WEEKLY',
      },
    });

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);
    const card = page.getByTestId('garden-event-card').filter({ hasText: 'Veckochore' });
    await card.getByTestId('edit-event').click();

    // Assert
    // Recurrence picker reflects FREQ=WEEKLY parsed from the row.
    await expect(page.locator('#recurrencePreset')).toContainText(/varje vecka|every week/i);
  });
});

test.describe('Calendar — planting dropdown label', () => {
  test('shows crop name + location, not the literal "Plantings #N"', async ({ page, request }) => {
    // Arrange — make sure at least one planting exists with a known crop name
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllGardenEvents(request, householdId);
    const existing = await (await request.get('/api/planting')).json();
    if (existing.length === 0) {
      const crops = await (await request.get('/api/crops')).json();
      const locations = await (await request.get('/api/location')).json();
      await request.post('/api/planting', {
        data: {
          cropId: crops[0].id,
          locationId: locations[0].id,
          plantedDate: '2026-04-01',
          areaM2: 1.0,
        },
      });
    }
    const plantings = (await (await request.get('/api/planting')).json()) as {
      id: number;
      cropId: number;
    }[];
    const crops = (await (await request.get('/api/crops')).json()) as {
      id: number;
      name: string;
    }[];
    const expectedCropName = crops.find((c) => c.id === plantings[0]!.cropId)!.name;

    // Act
    await page.goto('/calendar');
    await waitForCalendarReady(page);
    await page.getByRole('button', { name: /lägg till händelse|add event/i }).click();
    await expect(page.getByTestId('garden-event-form')).toBeVisible();

    // Assert — the planting picker contains the crop name as an option, NOT a literal "#1".
    const plantingPicker = page.getByTestId('event-plantings-picker');
    await plantingPicker.getByRole('combobox').click();
    await expect(
      plantingPicker.getByRole('option').filter({ hasText: expectedCropName }).first(),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Dashboard widget
// ---------------------------------------------------------------------------

test.describe('Dashboard — Kommande händelser widget', () => {
  test('widget "Kommande händelser" is visible on the dashboard', async ({ page }) => {
    // Arrange + Act
    await page.goto('/');

    // Assert
    await expect(page.getByTestId('upcoming-events-widget')).toBeVisible();
  });

  test('widget contains a link to /calendar', async ({ page }) => {
    // Arrange + Act
    await page.goto('/');

    // Assert
    const widget = page.getByTestId('upcoming-events-widget');
    await expect(widget.locator('a[href="/calendar"]')).toBeVisible();
  });

  test('widget shows "Kommande händelser" heading', async ({ page }) => {
    // Arrange + Act
    await page.goto('/');

    // Assert
    await expect(page.getByTestId('upcoming-events-widget')).toContainText('Kommande händelser');
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test.describe('Navigation — calendar link', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('bottom nav has a calendar link', async ({ page }) => {
    // Arrange + Act
    await page.goto('/');

    // Assert
    await expect(page.getByTestId('bottom-nav').locator('a[href="/calendar"]')).toBeVisible();
  });

  test('clicking the calendar nav link navigates to /calendar', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Act
    await page.getByTestId('bottom-nav').locator('a[href="/calendar"]').click();

    // Assert
    await expect(page).toHaveURL('/calendar');
  });
});
