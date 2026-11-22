// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createApp } from './app';
import { loadConfig } from './config';
import { createTestDb, type TestDB } from './test-utils/create-test-db';
import * as schema from './db/schema';
import { MembershipService } from './services/membership.service';

const ORIGIN = 'http://localhost:4200';

describe('Hono app (HTTP)', () => {
  let db: TestDB;
  let app: ReturnType<typeof createApp>;

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const { json, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set('origin', ORIGIN);
    if (json !== undefined) headers.set('content-type', 'application/json');
    return app.request(path, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };

  /** Another account with its own household, as if they had signed in elsewhere. */
  function otherHousehold() {
    const user = db
      .insert(schema.users)
      .values({ sub: 'other', name: 'Other', createdAt: Date.now() })
      .returning()
      .get();
    return new MembershipService(db).createHousehold(user.id, { name: 'Others', persons: 2 });
  }

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db, loadConfig({ AUTH_MODE: 'dev' }));
  });

  it('answers the health check without a user', async () => {
    // Act
    const res = await call('/api/health');

    // Assert
    expect(await res.json()).toEqual({ ok: true });
  });

  it('gives a new account its own household on the first API call', async () => {
    // Act
    const res = await call('/api/household/current');

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Dev Users hushåll', role: 'owner' });
  });

  it('returns 404 for a row in another household and { error } for bad input', async () => {
    // Arrange
    const other = otherHousehold();
    const location = db
      .insert(schema.growingLocation)
      .values({ householdId: other.id, name: 'Their bed', areaM2: 2 })
      .returning()
      .get();

    // Act
    const foreign = await call(`/api/location/${location.id}`);
    const invalid = await call('/api/location/abc');

    // Assert
    expect(foreign.status).toBe(404);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Invalid location id' });
  });

  it('creates a location in the active household and logs it', async () => {
    // Arrange
    const household = await (await call('/api/household/current')).json();

    // Act
    const res = await call('/api/location', {
      method: 'POST',
      json: { householdId: household.id, name: 'Köksland', areaM2: 4 },
    });
    const activity = await (await call('/api/activity')).json();

    // Assert
    expect(res.status).toBe(200);
    expect(activity).toEqual([
      expect.objectContaining({ action: 'created', householdId: household.id }),
    ]);
  });

  it('rejects a cross-site write', async () => {
    // Act
    const res = await app.request('/api/household', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'name=x',
    });

    // Assert
    expect(res.status).toBe(403);
  });

  describe('invites', () => {
    it('previews an invite without signing in, and joins without a household of ones own', async () => {
      // Arrange
      const other = otherHousehold();
      app = createApp(db, loadConfig({ AUTH_MODE: 'dev' }));
      const signedOut = (await call('/api/auth/logout', { method: 'POST' })).headers
        .get('set-cookie')!
        .split(';')[0]!;

      // Act
      const preview = await call(`/api/invite/${other.inviteCode}`, {
        headers: { cookie: signedOut },
      });
      const joined = await call(`/api/invite/${other.inviteCode}/join`, { method: 'POST' });
      const mine = await (await call('/api/household')).json();

      // Assert
      expect(await preview.json()).toEqual({ id: other.id, name: 'Others' });
      expect(joined.headers.get('set-cookie')).toContain(`garden_household=${other.id}`);
      expect(mine).toEqual([expect.objectContaining({ id: other.id, role: 'member' })]);
    });

    it('returns 404 for an unknown invite code', async () => {
      // Act
      const res = await call('/api/invite/nope');

      // Assert
      expect(res.status).toBe(404);
    });
  });

  it('uploads an image as multipart and serves it back with immutable caching', async () => {
    // Arrange
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#3a7' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('file', new File([new Uint8Array(png)], 'bed.png', { type: 'image/png' }));

    // Act
    const uploaded = await call('/api/image', { method: 'POST', body: form });
    const { id } = await uploaded.json();
    const fetched = await call(`/api/image/${id}`);

    // Assert
    expect(uploaded.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/webp');
    expect(fetched.headers.get('cache-control')).toContain('immutable');
    expect((await fetched.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('rejects an upload without a file', async () => {
    // Act
    const res = await call('/api/image', { method: 'POST', body: new FormData() });

    // Assert
    expect(res.status).toBe(400);
  });
});
