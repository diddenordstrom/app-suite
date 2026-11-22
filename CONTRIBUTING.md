# Contributing

Thanks for looking. This is a personal project, so small, focused pull requests are easiest to review. For anything bigger, open an issue first.

## Before you push

```bash
npm install
npm run check    # typecheck, lint, tests and docs check for every workspace
```

CI runs the same command. Never commit `.env` files or `data/`; both are gitignored. Add a new setting to the app's `.env.example`.

## Conventions

- **Commits** start with a [gitmoji](https://gitmoji.dev/) character, then a short imperative summary: `✨ Add trip balances`, `🐛 Fix login redirect`. Docs commits start with 📝.
- **Where code goes:** shared UI in `packages/ui`, shared strings in `packages/i18n`, shared server code in `packages/server-kit`. An app keeps only its own look (`tokens.css`, `Logo.tsx`), its domain code and its own dictionaries.
- **Strings:** every UI string goes through `t()` in both `en` and `sv`. Reuse a key from `packages/i18n/src/shared.ts` before adding one. Shared logic returns message keys and params, not text.
- **Colours** come only from tokens. New tokens use `light-dark()` and must keep text at WCAG AA in both modes.
- **Vite:** never name a client root file after a route (`settings.tsx` vs `/settings`), and proxy `"/api/"` with the trailing slash.
- **Docs:** decisions and open questions live in [docs/](docs/index.md). Conventions for writing there are in [docs/CLAUDE.md](docs/CLAUDE.md); run `npm run docs:index` after changing a page.

## Add an app

Copy an existing app folder into `apps/`, rename it in `package.json`, `vite.config.ts` (ports, manifest) and `compose.example.yml`, replace `tokens.css` and `Logo.tsx`, and strip its domain code. Then:

1. Add it to the `COPY apps/...` lines in `Dockerfile` and to the CI matrix.
2. In `deploy/`: a service in `compose.yml` with Traefik labels for its hostname, settings or secrets in `komodo/app-suite.toml` (secret values go in Komodo, never in git), and the app in `backup.sh` if it has data.
3. List it in the portfolio: `apps/portfolio/src/shared/apps.ts` plus its copy in both languages.

### Sign-in

Sign-in comes from `@homelab/server-kit`, so a new app writes none of it:

- `config.ts`: `interface Config extends AuthConfig`, and `...loadAuthConfig(env, { databasePath, publicUrl })` in `loadConfig`.
- `db/schema.ts`: `export const { users, sessions } = authTables();` (the same tables in every app).
- `app.ts`: `const auth = createAuth(db, config, { users, sessions })`, then `api.route("/auth", auth.routes())`, and `auth.requireUser` (or `auth.currentUser(c)`) where routes need a user.

### Demo mode

Each visitor at `<app>/demo` gets their own throwaway SQLite file. See [docs/decisions/demo-mode.md](docs/decisions/demo-mode.md).

1. `src/server/demo.ts`: `openDemo(file, fresh, config)` that opens the app on `file` with `authMode: "demo"` and, when `fresh`, fills it with demo data for `auth.demoUser()`, then checkpoints the WAL. Copy Fartlek's or Kvitt's; the demo data is the only real work, a few believable rows in each table.
2. `index.ts`: `createDemo({ dir: config.demo.dir, secret: config.sessionSecret, secure: config.production, open: (file, fresh) => openDemo(file, fresh, config) }).mount(app).startSweeper()` before the real routes.
3. Client: `<DemoBanner onEnd={…} />` when `authMode === "demo"` (ending calls `POST /api/auth/logout`), and `<DemoSignIn />` on the sign-in screen; both from `@homelab/ui`.
4. `vite.config.ts`: proxy `"^/demo$"` to the server, and add `/^\/demo$/` to the PWA's `navigateFallbackDenylist`.
5. `DEMO_ENABLED: "true"` in `deploy/compose.yml`, the demo lines in `.env.example`, and `demo: true` in the portfolio's `apps.ts`.
6. Anything that leaves the database file must be turned off when `authMode === "demo"`: uploads to disk, outside APIs, keys. Fartlek refuses Garmin and Etapp refuses photos there.

### Notifications

Web Push is optional. See [docs/decisions/web-push.md](docs/decisions/web-push.md).

1. `web-push` in the app's dependencies; `db/schema.ts`: `export const { pushSubscriptions, pushKeys } = pushTables(users);`, then `npm run db:generate`.
2. `app.ts`: `const push = createPush(db, config, { pushSubscriptions, pushKeys }, { cipher })` and `authed.route("/", push.routes())`; send with `push.sendTo(userId, (lang) => ({ title, body, url }))`. Daily sends: `dailyDue` and `startTicker` (Fartlek's `morning.ts` is the example).
3. `vite.config.ts`: `pushServiceWorker()` from `@homelab/ui/vite` in `plugins`, and `importScripts: [PUSH_SW]` in the PWA's `workbox`.
4. Settings: `<PushSettings request={api}>{the app's own options}</PushSettings>` from `@homelab/ui`. It hides itself in demo mode.

## License

By contributing you agree that your work is released under the [MIT license](LICENSE).
