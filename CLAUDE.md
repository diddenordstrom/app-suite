# app-suite

npm-workspaces monorepo of small self-hosted homelab apps (`apps/fartlek`, `apps/kvitt`, `apps/etapp`, `apps/portfolio`, `apps/brygga`, `apps/garden` (Autarki)) sharing `packages/ui`, `packages/i18n` and `packages/server-kit`. See [README.md](README.md) for layout, dev ports, shipping and how to add an app.

## Commits

Use [gitmoji](https://gitmoji.dev/): start every commit message with the emoji character, then a short imperative summary (`✨ Add trip balances`, `🐛 Fix login redirect`).

## Docs wiki

`docs/` holds the decisions, reasons and open questions for the whole suite. Start at [docs/index.md](docs/index.md) (generated, never hand-edited) and open only the pages you need; the conventions for reading and writing it are in [docs/CLAUDE.md](docs/CLAUDE.md). When a session settles something, file it there, add a log entry and run `npm run docs:index`. Docs commits start with 📝.

## Working here

- Run `npm run check` (typecheck + lint + tests for every workspace) before committing.
- Never commit `.env` files or `data/`; they are gitignored. Add new settings to the app's `.env.example`.
- Shared UI goes in `packages/ui`, shared strings in `packages/i18n`, shared server code in `packages/server-kit`. An app keeps only its own look (`tokens.css`, `Logo.tsx`), domain code and its own i18n dictionaries.
- Every UI string goes through `t()` in both `en` and `sv`; reuse a key from `packages/i18n/src/shared.ts` before adding one. Shared logic returns message keys + params, not text.
- Colours come only from tokens; new tokens use `light-dark()` and must keep text at WCAG AA in both modes.
- Vite gotcha: never name a client root file after a route (`settings.tsx` vs `/settings`), and proxy `"/api/"` with the trailing slash.
- Adding an app: also update the `COPY apps/...` lines in `Dockerfile`, the CI matrix, and `deploy/`: a service in `compose.yml` with Traefik labels for its hostname, any settings or secrets in `deploy/komodo/app-suite.toml` (secret values go in Komodo, never in git), and the app list in `backup.sh` if it has data. Sign-in comes from `createAuth` in server-kit; wiring it and demo mode is a short checklist under "Add an app" in the README.
