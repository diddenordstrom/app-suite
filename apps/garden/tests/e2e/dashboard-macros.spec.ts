import { test, expect, type APIRequestContext } from '@playwright/test';

// --- Setup helpers ---

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

async function deleteAllMacroTargets(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const res = await request.get(`/api/macro-target?householdId=${householdId}`);
  if (!res.ok()) return;

  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return;

  const targets = body as { id: number }[];
  for (const target of targets) {
    await request.delete(`/api/macro-target/${target.id}`);
  }
}

async function createActiveMacroTarget(
  request: APIRequestContext,
  householdId: number,
): Promise<void> {
  const target = (await (
    await request.post('/api/macro-target', {
      data: {
        householdId,
        name: 'Testprofil',
        dailyKcal: 2000,
        dailyProteinG: 150,
        dailyCarbsG: 250,
        dailyFatG: 70,
      },
    })
  ).json()) as { id: number };

  await request.post(`/api/macro-target/${target.id}/activate`);
}

// --- Tests ---

test.describe('Dashboard macro bars — no active target', () => {
  test.beforeEach(async ({ request }) => {
    // Arrange — ensure household exists and no macro target is active
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllMacroTargets(request, householdId);
  });

  test('shows a prompt to set a macro target when none is active', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert — the nutrition section must surface the empty-state element
    await expect(page.getByTestId('macro-bars-empty')).toBeVisible();
  });

  test('does not show macro bars when no target is active', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert — progress-bar rows must be absent from the DOM / hidden
    await expect(page.getByTestId('macro-bar-protein')).not.toBeVisible();
    await expect(page.getByTestId('macro-bar-carbs')).not.toBeVisible();
    await expect(page.getByTestId('macro-bar-fat')).not.toBeVisible();
  });

  test('empty prompt uses Swedish copy', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert — text comes from dashboard.nutrition.noProfile translation key
    await expect(page.getByTestId('macro-bars-empty')).toHaveText(
      'Skapa en näringsprofil i inställningarna',
    );
  });
});

test.describe('Dashboard macro bars — active target present', () => {
  test.beforeEach(async ({ request }) => {
    // Arrange — clean slate, then seed one active target with known values:
    //   protein 150 g/day, carbs 250 g/day, fat 70 g/day
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllMacroTargets(request, householdId);
    await createActiveMacroTarget(request, householdId);

    // Delete all plantings so 0% coverage tests are accurate
    const plantings = await (await request.get('/api/planting')).json();
    if (Array.isArray(plantings)) {
      for (const p of plantings as { id: number }[]) {
        await request.delete(`/api/planting/${p.id}`);
      }
    }
  });

  test('shows the nutrition section heading in Swedish', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert — section wrapper is present and labelled with the i18n title "Näring"
    await expect(page.getByTestId('macro-bars-section')).toBeVisible();
    await expect(page.getByTestId('macro-bars-section')).toContainText('Näring');
  });

  test('shows a row labelled Protein', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert
    await expect(page.getByTestId('macro-bar-protein')).toBeVisible();
    await expect(page.getByTestId('macro-bar-protein')).toContainText('Protein');
  });

  test('shows a row labelled Kolhydrater', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert — Swedish label for carbs from dashboard.nutrition.carbs
    await expect(page.getByTestId('macro-bar-carbs')).toBeVisible();
    await expect(page.getByTestId('macro-bar-carbs')).toContainText('Kolhydrater');
  });

  test('shows a row labelled Fett', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert — Swedish label for fat from dashboard.nutrition.fat
    await expect(page.getByTestId('macro-bar-fat')).toBeVisible();
    await expect(page.getByTestId('macro-bar-fat')).toContainText('Fett');
  });

  test('protein row label includes the annual target gram value', async ({ page }) => {
    // Arrange — annual protein target = 150 g * 365 = 54 750 g
    //   Coverage format: "{current}g / {target}g ({percent}%)"
    await page.goto('/');

    // Assert — the number 54 appears in the label (start of 54 750 or 54,750)
    await expect(page.getByTestId('macro-bar-protein')).toContainText('54');
  });

  test('carbs row label includes the annual target gram value', async ({ page }) => {
    // Arrange — annual carbs target = 250 g * 365 = 91 250 g
    await page.goto('/');

    // Assert — the number 91 appears in the label
    await expect(page.getByTestId('macro-bar-carbs')).toContainText('91');
  });

  test('fat row label includes the annual target gram value', async ({ page }) => {
    // Arrange — annual fat target = 70 g * 365 = 25 550 g
    await page.goto('/');

    // Assert — the number 25 appears in the label
    await expect(page.getByTestId('macro-bar-fat')).toContainText('25');
  });

  test('protein row label shows 0% coverage when there are no plantings', async ({
    page,
    request,
  }) => {
    // Arrange — ensure no plantings AND no storage exist (both contribute to coverage)
    const plantings = await (await request.get('/api/planting')).json();
    if (Array.isArray(plantings)) {
      for (const p of plantings as { id: number }[]) {
        await request.delete(`/api/planting/${p.id}`);
      }
    }
    const storage = await (await request.get('/api/storage')).json();
    if (Array.isArray(storage)) {
      for (const s of storage as { id: number }[]) {
        await request.delete(`/api/storage/${s.id}`);
      }
    }
    await page.goto('/');

    // Assert
    await expect(page.getByTestId('macro-bar-protein')).toContainText('0%');
  });

  test('carbs row label shows 0% coverage when there are no plantings', async ({
    page,
    request,
  }) => {
    // Arrange — ensure no plantings AND no storage exist (both contribute to coverage)
    const plantings = await (await request.get('/api/planting')).json();
    if (Array.isArray(plantings)) {
      for (const p of plantings as { id: number }[]) {
        await request.delete(`/api/planting/${p.id}`);
      }
    }
    const storage = await (await request.get('/api/storage')).json();
    if (Array.isArray(storage)) {
      for (const s of storage as { id: number }[]) {
        await request.delete(`/api/storage/${s.id}`);
      }
    }
    await page.goto('/');

    // Assert
    await expect(page.getByTestId('macro-bar-carbs')).toContainText('0%');
  });

  test('fat row label shows 0% coverage when there are no plantings', async ({ page, request }) => {
    // Arrange — ensure no plantings AND no storage exist (both contribute to coverage)
    const plantings = await (await request.get('/api/planting')).json();
    if (Array.isArray(plantings)) {
      for (const p of plantings as { id: number }[]) {
        await request.delete(`/api/planting/${p.id}`);
      }
    }
    const storage = await (await request.get('/api/storage')).json();
    if (Array.isArray(storage)) {
      for (const s of storage as { id: number }[]) {
        await request.delete(`/api/storage/${s.id}`);
      }
    }
    await page.goto('/');

    // Assert
    await expect(page.getByTestId('macro-bar-fat')).toContainText('0%');
  });

  test('protein fill bar is attached and carries an inline width style', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert — the coloured inner fill element must have style="width: …"
    const fill = page
      .getByTestId('macro-bar-protein')
      .locator('[data-testid="macro-bar-protein-fill"]');
    await expect(fill).toBeAttached();
    await expect(fill).toHaveAttribute('style', /width/);
  });

  test('carbs fill bar is attached and carries an inline width style', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert
    const fill = page
      .getByTestId('macro-bar-carbs')
      .locator('[data-testid="macro-bar-carbs-fill"]');
    await expect(fill).toBeAttached();
    await expect(fill).toHaveAttribute('style', /width/);
  });

  test('fat fill bar is attached and carries an inline width style', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Assert
    const fill = page.getByTestId('macro-bar-fat').locator('[data-testid="macro-bar-fat-fill"]');
    await expect(fill).toBeAttached();
    await expect(fill).toHaveAttribute('style', /width/);
  });
});

test.describe('Dashboard macro bars — target exists but is not active', () => {
  test.beforeEach(async ({ request }) => {
    // Arrange — create a target row but deliberately skip /activate
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllMacroTargets(request, householdId);

    await request.post('/api/macro-target', {
      data: {
        householdId,
        name: 'Inaktiv profil',
        dailyKcal: 2000,
        dailyProteinG: 150,
        dailyCarbsG: 250,
        dailyFatG: 70,
        // active defaults to false — no /activate call
      },
    });
  });

  test('shows empty prompt even when an inactive target exists in the database', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/');

    // Assert — an inactive target must not trigger the bars
    await expect(page.getByTestId('macro-bars-empty')).toBeVisible();
    await expect(page.getByTestId('macro-bar-protein')).not.toBeVisible();
  });
});
