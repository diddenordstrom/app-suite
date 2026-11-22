import { test, expect } from '@playwright/test';

// Runs in AUTH_MODE=dev: every request is the fixed "Dev User", who owns the
// household that is created automatically on the first request.

interface Household {
  id: number;
  name: string;
  inviteCode: string;
  role: 'owner' | 'member';
}

test.describe('Households — members and invite link', () => {
  test('settings shows the dev user as owner with an invite link', async ({ page, request }) => {
    // Arrange
    const current = (await (await request.get('/api/household/current')).json()) as Household;

    // Act
    await page.goto('/settings');

    // Assert
    const section = page.getByTestId('household-members');
    await expect(section).toBeVisible();
    await expect(section.getByTestId('invite-link')).toHaveValue(
      new RegExp(`/join/${current.inviteCode}$`),
    );
    await expect(section.getByTestId('member-list')).toContainText('Dev User');
    await expect(section.getByTestId('member-list')).toContainText(/Ägare|Owner/);
  });

  test('rotating the invite link replaces the code', async ({ page, request }) => {
    // Arrange
    const before = (await (await request.get('/api/household/current')).json()) as Household;
    await page.goto('/settings');
    const link = page.getByTestId('invite-link');
    await expect(link).toHaveValue(new RegExp(before.inviteCode));

    // Act
    await page.getByTestId('rotate-invite').click();

    // Assert
    await expect(link).not.toHaveValue(new RegExp(before.inviteCode));
    const res = await request.get(`/api/invite/${before.inviteCode}`);
    expect(res.status()).toBe(404);
  });

  test('the join page previews the household behind a valid code', async ({ page, request }) => {
    // Arrange
    const current = (await (await request.get('/api/household/current')).json()) as Household;

    // Act
    await page.goto(`/join/${current.inviteCode}`);

    // Assert
    await expect(page.getByTestId('join-household-name')).toContainText(current.name);
    await expect(page.getByTestId('join-button')).toBeVisible();
  });

  test('the join page explains an invalid code', async ({ page }) => {
    // Arrange — a code that was never issued

    // Act
    await page.goto('/join/not-a-real-code');

    // Assert
    await expect(page.getByTestId('join-page')).toContainText(
      /Länken fungerar inte|This link does not work/,
    );
  });
});

test.describe('Households — switching', () => {
  test('a second household shows the switcher and switching changes the active household', async ({
    page,
    request,
  }) => {
    // Arrange
    const first = (await (await request.get('/api/household/current')).json()) as Household;
    const second = (await (
      await request.post('/api/household', {
        data: { name: `Kolonilotten ${Date.now()}`, persons: 2 },
      })
    ).json()) as Household;
    await page.goto('/settings');
    const switcher = page.getByTestId('household-switcher');
    await expect(switcher).toBeVisible();

    // Act
    await switcher.getByRole('combobox').click();
    await page.getByRole('option', { name: second.name }).click();

    // Assert
    await expect(page.locator('#household-name')).toHaveValue(second.name);
    const active = (await (await page.request.get('/api/household/current')).json()) as Household;
    expect(active.id).toBe(second.id);
    expect(active.id).not.toBe(first.id);

    // Cleanup — delete the extra household so other specs keep a single one
    await page.request.delete(`/api/household/${second.id}`);
  });
});
