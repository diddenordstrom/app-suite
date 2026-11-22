import { test, expect, type APIRequestContext } from '@playwright/test';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

async function getOrCreateHousehold(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0].id;
  const created = (await (
    await request.post('/api/household', { data: { name: 'Test', persons: 2 } })
  ).json()) as { id: number };
  return created.id;
}

async function createLocation(
  request: APIRequestContext,
  householdId: number,
  name: string,
): Promise<{ id: number }> {
  return (await (
    await request.post('/api/location', {
      data: { householdId, name, areaM2: 4 },
    })
  ).json()) as { id: number };
}

let fixturePathA: string;
let fixturePathB: string;

test.beforeAll(async () => {
  const dir = join(tmpdir(), 'autarki-e2e-location-images');
  await mkdir(dir, { recursive: true });
  fixturePathA = join(dir, 'spring.png');
  fixturePathB = join(dir, 'summer.png');
  const a = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
  const b = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 160, b: 40 } },
  })
    .png()
    .toBuffer();
  await writeFile(fixturePathA, a);
  await writeFile(fixturePathB, b);
});

test.describe('Location images — hero replace/remove flow', () => {
  test('upload → replace → remove returns to empty state @smoke', async ({ page, request }) => {
    // Arrange — a fresh location so we don't collide with seeded data
    const householdId = await getOrCreateHousehold(request);
    const location = await createLocation(request, householdId, `Foto-test ${Date.now()}`);

    await page.goto(`/locations/${location.id}`);
    await page.waitForLoadState('networkidle');

    // Act — open upload from empty state
    await expect(page.getByTestId('location-no-image')).toBeVisible();
    await page
      .getByRole('button', { name: /lägg till foto|add photo|tilføj foto/i })
      .first()
      .click();

    await page.locator('[data-testid="location-image-file-input"]').setInputFiles(fixturePathA);
    await page.getByRole('button', { name: /spara|save|gem/i }).click();
    await page.waitForLoadState('networkidle');

    // Assert — hero shows
    const heroImg = page.getByTestId('location-hero').locator('img');
    await expect(heroImg).toBeVisible();
    const firstSrc = await heroImg.getAttribute('src');

    // Wait so the second image gets a strictly-later `uploadedAt` than the
    // first (SQLite's `datetime('now')` is second-precision). Otherwise the
    // ordering tiebreak is undefined and the hero might not flip visibly.
    await page.waitForTimeout(1100);

    // Act — replace with a second photo
    await page.getByRole('button', { name: /byt foto|replace photo|skift foto/i }).click();
    await expect(page.locator('[data-testid="location-image-file-input"]')).toBeVisible();
    await page.locator('[data-testid="location-image-file-input"]').setInputFiles(fixturePathB);
    await page.getByRole('button', { name: /spara|save|gem/i }).click();
    await page.waitForLoadState('networkidle');
    // The hero src is bound to imageId — wait for it to actually change.
    await expect
      .poll(async () => heroImg.getAttribute('src'), { timeout: 5000 })
      .not.toBe(firstSrc);

    // Assert — hero changed
    const newSrc = await heroImg.getAttribute('src');
    expect(newSrc).not.toBe(firstSrc);

    // Act — remove the latest hero. With one earlier row still in DB, the
    // previous photo should become the new hero (matches the soft-delete rule
    // "remove latest").
    await page.getByTestId('location-image-remove').click();
    await page.getByTestId('confirm-remove-location-image').click();
    await page.waitForLoadState('networkidle');

    await expect.poll(async () => heroImg.getAttribute('src'), { timeout: 5000 }).toBe(firstSrc);

    // Act — remove the last remaining one → empty state
    await page.getByTestId('location-image-remove').click();
    await page.getByTestId('confirm-remove-location-image').click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('location-no-image')).toBeVisible();
  });
});
