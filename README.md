# app-suite

Small self-hosted apps for the homelab, sharing one stack and one UI kit. Each app ships as its own Docker image.

| App | What | Dev ports (api / web) | Image |
| --- | --- | --- | --- |
| [Fartlek](apps/fartlek) | Training planner for self-coached runners, Garmin-based (formerly runplan) | 3000 / 5173 | `ghcr.io/<owner>/fartlek` |
| [Kvitt](apps/kvitt) | Shared shopping lists, trips and netted expenses (formerly shopsplit) | 3100 / 5180 | `ghcr.io/<owner>/kvitt` |
| [etapp](apps/etapp) | Roadtrip planner: days, stops, nights, shared by invite link | 3200 / 5190 | `ghcr.io/<owner>/etapp` |
| [garden](apps/garden) | Self-sufficiency garden planner (Autarki) | 3500 / 4200 | `ghcr.io/<owner>/garden` |
| [portfolio](apps/portfolio) | Static showcase of the apps above, links to each one and the blog | 3300 / 5200 | `ghcr.io/<owner>/portfolio` |
| [brygga](apps/brygga) | FIRE / bridge calculator: when can you stop working? No login, numbers stay in the browser | 3400 / 5210 | `ghcr.io/<owner>/brygga` |

## Layout
```
apps/<app>/          one app: src/server (Hono), src/client (React PWA), src/shared (pure logic), drizzle/ migrations
packages/ui/         shared UI kit: Skymning palette (skymning.css), components, AppShell, theme picker, SVG charts, Tailwind token mapping (theme.css)
packages/i18n/       shared Swedish/English i18n: language setting, t()/tn() and the strings all apps share
packages/server-kit/ shared server pieces: sign-in (Pocket ID over OIDC, dev, demo), demo mode, SQLite + migrations bootstrap, AES-256-GCM secrets
scripts/             build-server.mjs (bundles an app's server; workspace packages are inlined), docs-index.mjs (builds and checks docs/index.md)
docs/                the suite's wiki: decisions, open questions, notes. Start at docs/index.md
```
Each app keeps its own look in `src/client/ui/tokens.css` and `src/client/ui/Logo.tsx`; everything else UI comes from `@homelab/ui`. `tokens.css` imports the suite palette (`@homelab/ui/skymning.css`) and overrides only the app's *signature* colour (Fartlek coral, Kvitt mint, Etapp apricot, Brygga fjord blue), fonts and app-only tokens. Tokens are written as `light-dark(light, dark)`; light, dark or auto is the user's choice in Settings.

Every React app is in Swedish (default) and English. Shared strings live in `packages/i18n/src/shared.ts`; an app's own dictionaries in `src/client/i18n/` add to them and may override a shared key with domain wording.

## Develop
```
npm install
cp apps/fartlek/.env.example apps/fartlek/.env
npm run dev:fartlek        # or dev:kvitt / dev:etapp / dev:garden / dev:portfolio / dev:brygga; they can run at once
npm run check              # typecheck + lint + tests for every workspace
```
Gotcha: Vite serves client modules by URL, so never name a client root file after a route (`settings.tsx` vs `/settings`), and proxy `"/api/"` (with the slash).

## Ship
Push to `main`: CI audits production dependencies (`npm audit --audit-level=high --omit=dev`) and tests everything, then builds and pushes an image only for apps whose files (or a shared package) changed: `ghcr.io/<owner>/<app>:latest` and `:sha-…`. A tag `<app>-v1.2.3` also publishes `:1.2.3`.

Local image: `docker build --build-arg APP=fartlek -t fartlek .`

Homelab: [deploy/](deploy/README.md) is one Compose stack (every app plus Traefik) that [Komodo](https://komo.do) deploys from `main`: CI signals it once the images are pushed. Hostnames and secrets need no ssh; see the setup checklist there.

## Add an app
Copy an existing app folder into `apps/`, rename it in `package.json`, `vite.config.ts` (ports, manifest) and `compose.example.yml`, replace `tokens.css`/`Logo.tsx`, strip its domain code, and add it to the `COPY apps/...` lines in `Dockerfile` and the CI matrix. Then in `deploy/`: a service in `compose.yml` with Traefik labels for its hostname, settings or secrets in `komodo/app-suite.toml` (values in Komodo, never in git), and the app in `backup.sh` if it has data. Finally list it in the portfolio (`apps/portfolio/src/shared/apps.ts` plus its copy in both languages).

**Sign-in** comes from `@homelab/server-kit`, so a new app writes none of it:
- `config.ts`: `interface Config extends AuthConfig`, and `...loadAuthConfig(env, { databasePath, publicUrl })` in `loadConfig`.
- `db/schema.ts`: `export const { users, sessions } = authTables();` (the same tables in every app).
- `app.ts`: `const auth = createAuth(db, config, { users, sessions })`, then `api.route("/auth", auth.routes())`, and `auth.requireUser` (or `auth.currentUser(c)`) where routes need a user.

**Demo mode** (see [docs/decisions/demo-mode.md](docs/decisions/demo-mode.md)): each visitor at `<app>.didrik.dev/demo` gets their own throwaway SQLite file.
1. `src/server/demo.ts`: `openDemo(file, fresh, config)` that opens the app on `file` with `authMode: "demo"` and, when `fresh`, fills it with demo data for `auth.demoUser()`, then checkpoints the WAL. Copy Fartlek's or Kvitt's; the demo data is the only real work, a few believable rows in each table.
2. `index.ts`: `createDemo({ dir: config.demo.dir, secret: config.sessionSecret, secure: config.production, open: (file, fresh) => openDemo(file, fresh, config) }).mount(app).startSweeper()` before the real routes.
3. Client: `<DemoBanner onEnd={…} />` when `authMode === "demo"` (ending calls `POST /api/auth/logout`), and `<DemoSignIn />` on the sign-in screen; both from `@homelab/ui`.
4. `vite.config.ts`: proxy `"^/demo$"` to the server, and add `/^\/demo$/` to the PWA's `navigateFallbackDenylist`.
5. `DEMO_ENABLED: "true"` in `deploy/compose.yml`, the demo lines in `.env.example`, and `demo: true` in the portfolio's `apps.ts`.
6. Anything that leaves the database file must be turned off when `authMode === "demo"`: uploads to disk, outside APIs, keys. Fartlek refuses Garmin and Etapp refuses photos there.

**Notifications** (Web Push, see [docs/decisions/web-push.md](docs/decisions/web-push.md)) are optional:
1. `web-push` in the app's dependencies; `db/schema.ts`: `export const { pushSubscriptions, pushKeys } = pushTables(users);`, then `npm run db:generate`.
2. `app.ts`: `const push = createPush(db, config, { pushSubscriptions, pushKeys }, { cipher })` and `authed.route("/", push.routes())`; send with `push.sendTo(userId, (lang) => ({ title, body, url }))`. Daily sends: `dailyDue` and `startTicker` (Fartlek's `morning.ts` is the example).
3. `vite.config.ts`: `pushServiceWorker()` from `@homelab/ui/vite` in `plugins`, and `importScripts: [PUSH_SW]` in the PWA's `workbox`.
4. Settings: `<PushSettings request={api}>{the app's own options}</PushSettings>` from `@homelab/ui`. It hides itself in demo mode.

## License
[MIT](LICENSE). The apps run on a home server at `<app>.didrik.dev`; this repo is the code and the decisions behind them ([docs/](docs/index.md)).
