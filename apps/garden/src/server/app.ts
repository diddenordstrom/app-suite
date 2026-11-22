import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { createAuth } from '@homelab/server-kit';
import type { Config } from './config';
import type { DB } from './db/index';
import { sessions, users } from './db/schema';
import { householdMiddleware, type AppEnv } from './context';
import { ApiError } from './http';
import { activityRoutes } from './routes/activity';
import { cropPricesRoutes } from './routes/crop-prices';
import { cropsRoutes } from './routes/crops';
import { dashboardRoutes } from './routes/dashboard';
import { expenseRoutes } from './routes/expense';
import { gardenRoutes } from './routes/garden';
import { gardenEventRoutes } from './routes/garden-event';
import { householdRoutes } from './routes/household';
import { imageRoutes } from './routes/image';
import { inviteRoutes } from './routes/invite';
import { locationRoutes } from './routes/location';
import { macroAdvisoryRoutes } from './routes/macro-advisory';
import { macroPresetRoutes } from './routes/macro-preset';
import { macroTargetRoutes } from './routes/macro-target';
import { meRoutes } from './routes/me';
import { miscRoutes } from './routes/misc';
import { plantingRoutes } from './routes/planting';
import { resetRoutes } from './routes/reset';
import { seedVarietyRoutes } from './routes/seed-variety';
import { storageRoutes } from './routes/storage';
import { suggestionsRoutes } from './routes/suggestions';
import { timelineRoutes } from './routes/timeline';
import { wishlistRoutes } from './routes/wishlist';
import { zoneDetectRoutes } from './routes/zone-detect';

export function createApp(db: DB, config: Config) {
  const app = new Hono();
  const api = new Hono<AppEnv>();

  api.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  api.use('*', csrf({ origin: config.publicUrl }));
  api.get('/health', (c) => c.json({ ok: true }));
  const auth = createAuth(db, config, { users, sessions });
  api.route('/auth', auth.routes());

  api.use('*', householdMiddleware(db, auth));
  api.route('/activity', activityRoutes(db));
  api.route('/crop-prices', cropPricesRoutes(db));
  api.route('/crops', cropsRoutes(db));
  api.route('/dashboard', dashboardRoutes(db));
  api.route('/expense', expenseRoutes(db));
  api.route('/garden', gardenRoutes(db));
  api.route('/garden-event', gardenEventRoutes(db));
  api.route('/household', householdRoutes(db));
  api.route('/image', imageRoutes(db));
  api.route('/invite', inviteRoutes(db, config));
  api.route('/location', locationRoutes(db));
  api.route('/macro-advisory', macroAdvisoryRoutes(db));
  api.route('/macro-preset', macroPresetRoutes(db));
  api.route('/macro-target', macroTargetRoutes(db));
  api.route('/me', meRoutes(db, config));
  api.route('/', miscRoutes(db));
  api.route('/planting', plantingRoutes(db));
  api.route('/reset', resetRoutes(db));
  api.route('/seed-variety', seedVarietyRoutes(db));
  api.route('/storage', storageRoutes(db));
  api.route('/suggestions', suggestionsRoutes(db));
  api.route('/timeline', timelineRoutes(db));
  api.route('/wishlist', wishlistRoutes(db));
  api.route('/zone-detect', zoneDetectRoutes());

  app.route('/api', api);
  return app;
}
