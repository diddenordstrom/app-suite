import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveClient } from '@homelab/server-kit';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/index';
import { seedReferenceData } from './db/seed';

const config = loadConfig();
const db = createDb(config.databasePath);
seedReferenceData(db);

const app = new Hono();
app.route('/', createApp(db, config));

// In production the API also serves the built client.
if (fs.existsSync('dist/client')) {
  serveClient(app);
}

serve({ fetch: app.fetch, port: config.port }, (i) =>
  console.log(`listening on :${i.port} (auth=${config.authMode})`),
);
