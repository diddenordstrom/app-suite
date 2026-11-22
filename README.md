# app-suite

Small, self-hosted web apps for the homelab. They share one stack, one UI kit and one sign-in, and each ships as its own Docker image.

Every app is a PWA in Swedish and English and stores its data in a single SQLite file.

## Apps

| App | What it does | Demo |
| --- | --- | --- |
| [Fartlek](apps/fartlek) | Training planner for self-coached runners, built on Garmin data | [try it](https://fartlek.didrik.dev/demo) |
| [Kvitt](apps/kvitt) | Shared shopping lists, trips and netted expenses for households and friends | [try it](https://kvitt.didrik.dev/demo) |
| [Etapp](apps/etapp) | Roadtrip planner: days, stops and nights, shared by invite link | [try it](https://etapp.didrik.dev/demo) |
| [Autarki](apps/garden) | Self-sufficiency garden planner with calorie accounting and succession planting | |
| [Brygga](apps/brygga) | FIRE / bridge calculator: when can you stop working? No login, numbers stay in the browser | |
| [Portfolio](apps/portfolio) | Static showcase of the apps above | |

The demos give each visitor a throwaway account, so no sign-up is needed.

## Stack

- **Server:** [Hono](https://hono.dev) on Node, [SQLite](https://github.com/WiseLibs/better-sqlite3) with [Drizzle](https://orm.drizzle.team) migrations.
- **Client:** React and Vite, Tailwind v4, installable as a PWA.
- **Sign-in:** OpenID Connect (built for [Pocket ID](https://pocket-id.org)), plus a dev mode and a demo mode.
- **Tooling:** npm workspaces, TypeScript, ESLint, Vitest, Playwright.
- **Deploy:** one Docker image per app, one Compose stack behind Traefik, redeployed by [Komodo](https://komo.do).

## Repository layout

```
apps/<app>/           one app: src/server, src/client, src/shared (pure logic), drizzle/ migrations
packages/ui/          shared UI kit: palette, components, app shell, charts
packages/i18n/        shared Swedish/English strings and t()
packages/server-kit/  sign-in, demo mode, SQLite bootstrap, secret encryption
deploy/               Compose stack and Komodo setup for the homelab
docs/                 the suite's wiki: decisions, open questions, notes (start at docs/index.md)
scripts/              build and docs tooling
```

## Run it locally

You need Node 22 or newer.

```bash
npm install
cp apps/fartlek/.env.example apps/fartlek/.env
npm run dev:fartlek
```

Dev mode signs you in automatically, so no identity provider is needed. Several apps can run at once:

| Command | App | API | Web |
| --- | --- | --- | --- |
| `npm run dev:fartlek` | Fartlek | 3000 | 5173 |
| `npm run dev:kvitt` | Kvitt | 3100 | 5180 |
| `npm run dev:etapp` | Etapp | 3200 | 5190 |
| `npm run dev:portfolio` | Portfolio | 3300 | 5200 |
| `npm run dev:brygga` | Brygga | 3400 | 5210 |
| `npm run dev:garden` | Autarki | 3500 | 4200 |

Open the web port in a browser. Each app has its own `.env.example` with the settings it reads.

Before you commit, run everything CI runs:

```bash
npm run check    # typecheck, lint, tests and docs check for every workspace
```

## Build and deploy

```bash
docker build --build-arg APP=fartlek -t fartlek .
```

On every push to `main`, CI audits production dependencies, runs the checks and publishes an image only for the apps that changed. The homelab setup, including Traefik, hostnames and secrets, is described in [deploy/](deploy/README.md).

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers conventions and how to add an app. Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).
