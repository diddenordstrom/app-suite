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

async function deleteAllExpenses(request: APIRequestContext, householdId: number): Promise<void> {
  const res = await request.get(`/api/expense?householdId=${householdId}`);
  if (!res.ok()) return;

  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return;

  const expenses = body as { id: number }[];
  for (const expense of expenses) {
    await request.delete(`/api/expense/${expense.id}`);
  }
}

async function waitForPageReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Page loads
// ---------------------------------------------------------------------------

test.describe('Expenses page', () => {
  test('loads at /finances', async ({ page }) => {
    // Arrange + Act
    await page.goto('/finances');

    // Assert
    await expect(page).toHaveURL('/finances');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows "Ekonomi" heading', async ({ page }) => {
    // Arrange + Act
    await page.goto('/finances');

    // Assert
    await expect(page.locator('h1')).toContainText('Ekonomi');
  });

  test('shows add button', async ({ page }) => {
    // Arrange + Act
    await page.goto('/finances');

    // Assert — identified by its aria-label
    await expect(
      page.getByRole('button', { name: /lägg till kostnad|add expense/i }).first(),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test.describe('Expenses — navigation', () => {
  test('side nav contains a link to /finances', async ({ page }) => {
    // Arrange + Act
    await page.goto('/');

    // Assert — desktop sidebar link
    await expect(page.getByTestId('sidebar-nav').locator('a[href="/finances"]')).toBeVisible();
  });

  test('clicking the nav link navigates to /finances', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Act
    await page.getByTestId('sidebar-nav').locator('a[href="/finances"]').click();

    // Assert
    await expect(page).toHaveURL('/finances');
  });
});

// ---------------------------------------------------------------------------
// Form — open / close
// ---------------------------------------------------------------------------

test.describe('Expenses — form open/close', () => {
  test('clicking add button opens the modal form', async ({ page }) => {
    // Arrange
    await page.goto('/finances');
    await waitForPageReady(page);

    // Act
    await page
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .first()
      .click();

    // Assert
    await expect(page.getByTestId('expense-form')).toBeVisible();
  });

  test('cancel button closes the form', async ({ page }) => {
    // Arrange
    await page.goto('/finances');
    await waitForPageReady(page);
    await page
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .first()
      .click();
    await expect(page.getByTestId('expense-form')).toBeVisible();

    // Act
    await page
      .getByTestId('expense-form')
      .getByRole('button', { name: /avbryt|cancel/i })
      .click();

    // Assert
    await expect(page.getByTestId('expense-form')).not.toBeVisible();
  });

  test('date field is pre-filled with today', async ({ page }) => {
    // Arrange
    const today = new Date().toISOString().slice(0, 10);
    await page.goto('/finances');
    await waitForPageReady(page);

    // Act
    await page
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .first()
      .click();

    // Assert — date input already has today's date
    const dateInput = page.getByTestId('expense-form').locator('input[type="date"]');
    await expect(dateInput).toHaveValue(today);
  });
});

// ---------------------------------------------------------------------------
// Add expense — happy path
// ---------------------------------------------------------------------------

test.describe('Expenses — add expense', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllExpenses(request, householdId);
  });

  test('submitting a valid form creates a new expense in the list', async ({ page }) => {
    // Arrange
    await page.goto('/finances');
    await waitForPageReady(page);
    await page
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .first()
      .click();
    await expect(page.getByTestId('expense-form')).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);

    // Act
    await page.getByTestId('expense-form').getByRole('textbox').first().fill('Jord och gödsel');
    await page.getByTestId('expense-form').locator('input[type="number"]').fill('349');
    await page.getByTestId('expense-form').locator('input[type="date"]').fill(today);

    await page
      .getByTestId('expense-form')
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .click();

    // Assert — form closes and expense appears in list
    await expect(page.getByTestId('expense-form')).not.toBeVisible();
    await expect(page.getByTestId('expense-list')).toBeVisible();
    await expect(
      page.getByTestId('expense-item').filter({ hasText: 'Jord och gödsel' }),
    ).toBeVisible();
  });

  test('new expense shows the correct cost in the list', async ({ page }) => {
    // Arrange
    await page.goto('/finances');
    await waitForPageReady(page);
    await page
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .first()
      .click();

    const today = new Date().toISOString().slice(0, 10);

    // Act
    await page.getByTestId('expense-form').getByRole('textbox').first().fill('Fröer');
    await page.getByTestId('expense-form').locator('input[type="number"]').fill('125');
    await page.getByTestId('expense-form').locator('input[type="date"]').fill(today);

    await page
      .getByTestId('expense-form')
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .click();

    // Assert
    await expect(page.getByTestId('expense-item').filter({ hasText: 'Fröer' })).toContainText(
      '125',
    );
  });

  test('total updates after adding an expense', async ({ page }) => {
    // Arrange
    await page.goto('/finances');
    await waitForPageReady(page);

    // P&L card shows total spent for the selected year — starts at 0 with no expenses.
    const totalBefore = page.getByTestId('pl-spent');
    await expect(totalBefore).toContainText('0');

    await page
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .first()
      .click();

    const today = new Date().toISOString().slice(0, 10);

    // Act
    await page.getByTestId('expense-form').getByRole('textbox').first().fill('Kompost');
    await page.getByTestId('expense-form').locator('input[type="number"]').fill('500');
    await page.getByTestId('expense-form').locator('input[type="date"]').fill(today);

    await page
      .getByTestId('expense-form')
      .getByRole('button', { name: /lägg till kostnad|add expense/i })
      .click();

    // Assert
    await expect(page.getByTestId('pl-spent')).toContainText('500');
  });
});

// ---------------------------------------------------------------------------
// Edit expense
// ---------------------------------------------------------------------------

test.describe('Expenses — edit expense', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllExpenses(request, householdId);
  });

  test('clicking "Redigera" opens the form pre-filled with the expense data', async ({
    page,
    request,
  }) => {
    // Arrange — seed an expense via API
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/expense', {
      data: { householdId, name: 'Ursprunglig kostnad', cost: 200, date: today },
    });

    await page.goto('/finances');
    await waitForPageReady(page);

    // Act
    await page
      .getByTestId('expense-item')
      .filter({ hasText: 'Ursprunglig kostnad' })
      .getByRole('button', { name: /redigera|edit/i })
      .click();

    // Assert — form is open with pre-filled name
    await expect(page.getByTestId('expense-form')).toBeVisible();
    await expect(page.getByTestId('expense-form').getByRole('textbox').first()).toHaveValue(
      'Ursprunglig kostnad',
    );
  });

  test('editing and saving updates the expense in the list', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/expense', {
      data: { householdId, name: 'Gammal titel', cost: 100, date: today },
    });

    await page.goto('/finances');
    await waitForPageReady(page);

    // Act
    await page
      .getByTestId('expense-item')
      .filter({ hasText: 'Gammal titel' })
      .getByRole('button', { name: /redigera|edit/i })
      .click();

    await page.getByTestId('expense-form').getByRole('textbox').first().fill('Ny titel');
    await page
      .getByTestId('expense-form')
      .getByRole('button', { name: /redigera|spara|save|edit/i })
      .last()
      .click();

    // Assert
    await expect(page.getByTestId('expense-form')).not.toBeVisible();
    await expect(page.getByTestId('expense-item').filter({ hasText: 'Ny titel' })).toBeVisible();
    await expect(
      page.getByTestId('expense-item').filter({ hasText: 'Gammal titel' }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Delete expense
// ---------------------------------------------------------------------------

test.describe('Expenses — delete expense', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllExpenses(request, householdId);
  });

  test('confirming delete removes the expense from the list', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/expense', {
      data: { householdId, name: 'Kostnad att ta bort', cost: 75, date: today },
    });

    await page.goto('/finances');
    await waitForPageReady(page);

    // Act — accept the confirm dialog
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByTestId('expense-item')
      .filter({ hasText: 'Kostnad att ta bort' })
      .getByRole('button', { name: /ta bort|delete/i })
      .click();

    // Assert
    await expect(
      page.getByTestId('expense-item').filter({ hasText: 'Kostnad att ta bort' }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Year filter
// ---------------------------------------------------------------------------

test.describe('Expenses — year filter', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllExpenses(request, householdId);
  });

  test('year filter defaults to current year', async ({ page }) => {
    // Arrange + Act
    const currentYear = new Date().getFullYear().toString();
    await page.goto('/finances');
    await waitForPageReady(page);

    // Assert — current year pill has active styling
    const yearPill = page.getByTestId('year-filter').getByRole('button', { name: currentYear });
    await expect(yearPill).toHaveClass(/bg-primary/);
  });

  // "Alla år" pill was removed during the /expenses → /finances rename.
  // The finances page now buckets forecast/realized/net per year, so "all years"
  // no longer fits the P&L model — clicking the previous-year pill is how you
  // see prior-year expenses.
  test("clicking a previous-year pill shows that year's expenses", async ({ page, request }) => {
    // Arrange — one expense this year, one last year
    const householdId = await getOrCreateHouseholdId(request);
    const lastYear = new Date().getFullYear() - 1;
    await request.post('/api/expense', {
      data: { householdId, name: 'I år', cost: 100, date: `${new Date().getFullYear()}-06-01` },
    });
    await request.post('/api/expense', {
      data: { householdId, name: 'Förra året', cost: 200, date: `${lastYear}-06-01` },
    });

    await page.goto('/finances');
    await waitForPageReady(page);

    // Act — switch to last year's pill
    await page
      .getByTestId('year-filter')
      .getByRole('button', { name: String(lastYear) })
      .click();

    // Assert — only last-year expense visible
    await expect(page.getByTestId('expense-item').filter({ hasText: 'Förra året' })).toBeVisible();
    await expect(page.getByTestId('expense-item').filter({ hasText: 'I år' })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

test.describe('Expenses — search', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllExpenses(request, householdId);
  });

  test('search filters expense list by name', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/expense', {
      data: { householdId, name: 'Jord', cost: 100, date: today },
    });
    await request.post('/api/expense', {
      data: { householdId, name: 'Gödsel', cost: 50, date: today },
    });

    await page.goto('/finances');
    await waitForPageReady(page);

    // Act
    await page.getByTestId('search-input').fill('Jord');

    // Assert — only matching item visible
    await expect(page.getByTestId('expense-item').filter({ hasText: 'Jord' })).toBeVisible();
    await expect(page.getByTestId('expense-item').filter({ hasText: 'Gödsel' })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

test.describe('Expenses — sort', () => {
  test.beforeEach(async ({ request }) => {
    const householdId = await getOrCreateHouseholdId(request);
    await deleteAllExpenses(request, householdId);
  });

  test('sort button opens the sort menu', async ({ page }) => {
    // Arrange
    await page.goto('/finances');
    await waitForPageReady(page);

    // Act
    await page.getByRole('button', { name: /sortera|sort/i }).click();

    // Assert
    await expect(page.getByTestId('sort-menu')).toBeVisible();
  });

  test('sort by cost orders expenses by cost descending', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHouseholdId(request);
    const today = new Date().toISOString().slice(0, 10);
    await request.post('/api/expense', {
      data: { householdId, name: 'Billig sak', cost: 50, date: today },
    });
    await request.post('/api/expense', {
      data: { householdId, name: 'Dyr sak', cost: 999, date: today },
    });

    await page.goto('/finances');
    await waitForPageReady(page);

    // Act
    await page.getByRole('button', { name: /sortera|sort/i }).click();
    await page
      .getByTestId('sort-menu')
      .getByRole('button', { name: /kostnad|cost/i })
      .click();

    // Assert — "Dyr sak" (999 kr) appears before "Billig sak" (50 kr)
    const items = page.getByTestId('expense-item');
    await expect(items.first()).toContainText('Dyr sak');
    await expect(items.last()).toContainText('Billig sak');
  });
});

// ---------------------------------------------------------------------------
// Dashboard widget
// ---------------------------------------------------------------------------

test.describe('Dashboard — expenses widget', () => {
  test('dashboard shows total expenses for this year', async ({ page }) => {
    // Arrange + Act
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert — the expenses total card is visible
    await expect(page.getByTestId('dashboard-expenses-total')).toBeVisible();
  });

  test('dashboard expenses widget has a link to /finances', async ({ page }) => {
    // Arrange + Act
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(page.locator('a[href="/finances"]').first()).toBeVisible();
  });
});
