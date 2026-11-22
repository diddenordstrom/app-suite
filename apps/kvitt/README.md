# kvitt

Shared shopping lists, trips, expenses and netted balances for households and friend groups. Built from app-template (Hono + React/Vite PWA + SQLite/Drizzle, OIDC for admins, one Docker image). Plan: brain/projects/kvitt/plan.md.


## Run locally
`cp .env.example .env` (if missing), `npm install`, `npm run dev` → http://localhost:5180. Dev mode auto-logs in an admin ("Dev User"). To try the member flow, sign out in Settings (sets a `dev_anon` cookie), then open the invite link from another browser or a private window.

## How it works
- Admins sign in with Pocket ID (OIDC) and create households. Members join through `/join/<code>` with just a name and get a long-lived cookie plus a personal recovery link (`/api/recover/<token>`).
- Lists are owner-editable; anyone can start a trip over several lists, check items off (works offline), and check out with one amount per owner.
- Expenses (equal / shares / exact), trips and settlements feed one ledger netted per pair (`src/shared/balances.ts`). Live updates via SSE.
- Plånböcker: members who share money (a couple) count as one in balances; a car calculator in the expense form turns a drive into an amount. See [docs/decisions/kvitt-wallets-and-car.md](../../docs/decisions/kvitt-wallets-and-car.md).

## Layout
`src/server` Hono API · `src/client` React PWA (`ui/` = kit: tokens, components, `AppShell`) · `src/shared` pure logic/types.

## Scripts
`dev` · `build` · `start` · `test` · `typecheck` · `lint` · `check` · `db:generate`

## Notes
- Demo mode (`/demo`, linked from the portfolio and the welcome screen): each visitor gets their own throwaway database file in `demo/` with a shared flat with lists, a finished trip, expenses and a settlement. At most 100 at once, deleted after 2 hours without use or when the visitor ends the demo. Turned on with `DEMO_ENABLED=true`; see [docs/decisions/demo-mode.md](../../docs/decisions/demo-mode.md).
- `AUTH_MODE=dev` is refused when `NODE_ENV=production`. Sessions are server-side in SQLite; cookies are signed.
- UI kit is copied between apps; extract a shared package when app #2 exists.
