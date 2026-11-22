import { test, expect, type APIRequestContext } from '@playwright/test';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function getOrCreateHousehold(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/household');
  const households = (await res.json()) as { id: number }[];
  if (households.length > 0) return households[0].id;
  const created = (await (
    await request.post('/api/household', { data: { name: 'Test', persons: 2 } })
  ).json()) as { id: number };
  return created.id;
}

async function getFirstCrop(request: APIRequestContext): Promise<{ id: number }> {
  const res = await request.get('/api/crops');
  const crops = (await res.json()) as { id: number }[];
  return crops[0]!;
}

async function getOrCreateLocation(
  request: APIRequestContext,
  householdId: number,
): Promise<{ id: number }> {
  const res = await request.get('/api/location');
  const locations = (await res.json()) as { id: number; householdId: number }[];
  const own = locations.find((l) => l.householdId === householdId);
  if (own) return own;
  return (await (
    await request.post('/api/location', {
      data: { householdId, name: 'Foto-bädd', areaM2: 3 },
    })
  ).json()) as { id: number };
}

async function createPlanting(
  request: APIRequestContext,
  cropId: number,
  locationId: number,
): Promise<{ id: number }> {
  return (await (
    await request.post('/api/planting', {
      data: {
        cropId,
        locationId,
        plantedDate: '2026-04-01',
        areaM2: 1,
        plantingMode: 'area',
        status: 'growing',
      },
    })
  ).json()) as { id: number };
}

let fixturePath: string;

test.beforeAll(async () => {
  const dir = join(tmpdir(), 'autarki-e2e-images');
  await mkdir(dir, { recursive: true });
  fixturePath = join(dir, 'first-true-leaves.png');
  const buf = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 60, g: 140, b: 60 } },
  })
    .png()
    .toBuffer();
  await writeFile(fixturePath, buf);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Planting images — full journal flow', () => {
  test('upload → hero → lightbox → cascade delete @smoke', async ({ page, request }) => {
    // Arrange
    const householdId = await getOrCreateHousehold(request);
    const crop = await getFirstCrop(request);
    const location = await getOrCreateLocation(request, householdId);
    const planting = await createPlanting(request, crop.id, location.id);

    await page.goto(`/plantings/${planting.id}`);
    await page.waitForLoadState('networkidle');

    // Act — open upload modal from empty state
    await expect(page.getByTestId('planting-no-images')).toBeVisible();
    await page
      .getByRole('button', { name: /lägg till foto|add photo/i })
      .first()
      .click();

    // Set the file on the hidden input directly to bypass the file chooser.
    await page.locator('[data-testid="image-file-input"]').setInputFiles(fixturePath);

    // Add a caption and save
    await page.locator('#image-caption').fill('First true leaves');
    await page.getByRole('button', { name: /spara|save/i }).click();

    // Wait for the upload + attach round-trip + reload to settle
    await page.waitForLoadState('networkidle');

    // Assert — hero image rendered
    const heroImg = page.getByTestId('planting-hero').locator('img');
    await expect(heroImg).toBeVisible();

    // Tap the hero → lightbox opens with caption
    await page.getByTestId('planting-hero').locator('button').click();
    await expect(page.getByText('First true leaves')).toBeVisible();

    // Delete via lightbox → confirm dialog → cascade delete
    await page.getByTestId('lightbox-delete').click();
    await expect(
      page.getByText(/First true leaves.*tas bort permanent|First true leaves.*permanently/i),
    ).toBeVisible();
    await page.getByTestId('confirm-delete-image').click();
    await page.waitForLoadState('networkidle');

    // Back to empty state
    await expect(page.getByTestId('planting-no-images')).toBeVisible();
  });
});
