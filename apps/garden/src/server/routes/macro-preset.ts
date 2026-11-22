import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle } from '../http';
import type { AppEnv } from '../context';
import { MacroPresetService } from '../services/macro-preset.service';

export function macroPresetRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const macroPresetService = new MacroPresetService(db);

  app.get(
    '/',
    handle(async () => {
      return macroPresetService.getAll();
    }),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid macro preset id');
      }

      const preset = await macroPresetService.getById(id);

      if (preset === null) {
        throw new ApiError(404, 'Macro preset not found');
      }

      return preset;
    }),
  );

  return app;
}
