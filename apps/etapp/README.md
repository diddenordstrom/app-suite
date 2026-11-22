# Etapp

Roadtrip planner for trips with a roof tent: a trip is split into days, each day into stops with things to do, and every day ends with where you sleep. The admin plans and shares an invite link; travel companions join with just a name and can plan and tick things off too. Built on the app-suite stack (Hono + React/Vite PWA + SQLite/Drizzle, OIDC for admins, one Docker image). Ported from the Travel Buddy artifact.

## Run locally
`cp .env.example .env` (if missing), `npm install`, `npm run dev` → http://localhost:5190. Dev mode auto-logs in an admin ("Dev User") and, on an empty database, seeds the demo trip "Bilresa Norge" (seven days, Lom to Trollstigen). To try the traveller flow, open the invite link from Settings in another browser or a private window.

## How it works
- **Sharing.** Admins sign in with Pocket ID (OIDC) and create trips. Travellers join through `/join/<code>` with just a name and get a long-lived cookie plus a personal recovery link (`/api/recover/<token>`). Any traveller can edit the plan; the trip name, invite link and travellers are admin-only.
- **Plan.** Days (with the night), stops (position, note, usual season), todos (fika, mat, sova, se, fixa) and a packing list with a roof-tent starter. Stop numbers run through the whole trip like road signs; moving a stop past a day's edge moves it into the next day.
- **Start.** Home (each traveller sets their own in Settings), the device's location, or any place or "lat, lon". A day starts where the previous one ended.
- **Quick entry.** One line per stop, todos after commas, `dag Title` for a new day, `natt Place` for the night; coordinates or a long Google Maps link give a position. Short `maps.app.goo.gl` links carry no position and get a warning. Bullets pasted from a notes app are ignored.
- **Out to the real tools.** Directions, day and whole-trip routes, nearby and along-the-way searches open Google Maps; weather opens yr.no. Distances and times in the app are rough (straight line × 1.3 at 70 km/h) and say so; the map tab is schematic, without a base map.
- **Photos.** A day can have a cover photo, scaled to 1400 px JPEG in the browser and stored in `UPLOADS_DIR` (default: `uploads` next to the database, so `/data/uploads` in Docker; back up `/data`).
- **Live and offline.** Changes reach other travellers via SSE (`/api/t/:tid/events`). The last plan is cached for reading offline, and ticking todos and packing items works offline: ticks queue on the device and sync when it is back online. Other edits need a connection.

## Layout
`src/server` Hono API (`routes/`, `planStore.ts`, `photos.ts`, `seed.ts`) · `src/client` React PWA (`ui/` = tokens, logo; the kit comes from `@homelab/ui`) · `src/shared` pure, tested logic: `plan` (route walking, stats, dates, seasons), `geo`, `links`, `quick`, `packing`.

## Scripts
`dev` · `build` · `start` · `test` · `typecheck` · `check` · `db:generate`

## Notes
- Demo mode (`/demo`, linked from the portfolio and the welcome screen): each visitor gets their own throwaway database file in `demo/` with the demo trip "Bilresa Norge"; photo uploads are refused. At most 100 at once, deleted after 2 hours without use or when the visitor ends the demo. Turned on with `DEMO_ENABLED=true`; see [docs/decisions/demo-mode.md](../../docs/decisions/demo-mode.md).
- `AUTH_MODE=dev` is refused when `NODE_ENV=production`, and the demo seed only runs in dev mode. Sessions are server-side in SQLite; cookies are signed.
- Photos are served only to travellers on the trip, under random names.
