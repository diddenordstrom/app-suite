import { Hono } from 'hono';
import { ApiError, handle, getQuery } from '../http';
import type { AppEnv } from '../context';
import { detectGrowingZone } from '../services/zone-detection.service';

export function zoneDetectRoutes() {
  const app = new Hono<AppEnv>();

  app.get(
    '/',
    handle((c) => {
      const query = getQuery(c);
      const latitude = Number(query.latitude);
      const longitude = Number(query.longitude);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new ApiError(400, 'latitude and longitude are required');
      }

      const zone = detectGrowingZone({ latitude, longitude });

      if (zone === null) {
        throw new ApiError(422, 'Coordinates are outside Sweden');
      }

      return { zone };
    }),
  );

  return app;
}
