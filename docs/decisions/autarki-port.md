---
title: Porting Autarki (garden) to the suite stack
summary: Autarki moves from Nuxt/Vue/Nitro to Hono + server-kit + React in three steps, server first, without keeping any data
type: decision
status: accepted
updated: 2026-11-12
---

# Porting Autarki (garden) to the suite stack

## Decision

`apps/garden` (Autarki) was moved in as a Nuxt app with its own conventions. It is ported to the stack the other apps share (Hono server, Drizzle migrations, `@homelab/server-kit`, React/Vite client on `@homelab/ui` and `@homelab/i18n`) in three steps:

1. **Server.** Nitro is replaced by a Hono server in `src/server` built like the other apps (`createApp(db, config)`, `scripts/build-server.mjs`, `dist/server/index.js`). Sign-in comes from `createAuth` in server-kit; the schema is applied with drizzle-kit migrations through `openDb`. The Nuxt client stays, built as a static SPA into `dist/client` and served by `serveClient`. The API keeps its URLs, so the client is unchanged apart from the invite login.
2. **Client.** The Vue pages are rewritten in React on `@homelab/ui`, in one go on a branch rather than page by page (mixing Vue and React in one SPA costs more than it saves). The Playwright suite is the acceptance test.
3. **Clean-up.** Nuxt and its dependencies, garden's exceptions in the root README, CLAUDE.md, lint and CI go away; demo mode is switched on.

Also decided:

- **No data is kept.** Nobody uses Autarki today, so the old hand-written `ALTER TABLE` list and `app_user`/`session` tables are dropped instead of migrated; the first Drizzle migration is a fresh baseline. Komodo's garden volume can be wiped when step 1 deploys.
- **Danish goes.** Only sv and en, like the rest of the suite.
- **garden's own `CLAUDE.md` and `BACKLOG.md` conventions are not carried over.** The suite's CLAUDE.md and this wiki apply; the backlog's still-open items are moved here or dropped when step 2 starts.
- **Invites keep working through the suite's login.** server-kit's `/api/auth/login` takes a same-site `returnTo`; the invite page sends the visitor back to `/join/<code>?auto=1` and joins once they are signed in. Joining no longer happens inside the OIDC callback, and visiting an invite does not create a household of one's own first.

## Step 1 built

- **Deploy needs two things first**, or the container won't start: set `GARDEN_SESSION_SECRET` (32+ characters) in Komodo, and empty `${DATA_DIR}/garden`. The old database has the tables but no Drizzle journal, so the baseline migration would stop on "table already exists".
- Running the tests against the migrations instead of the old hand-written test DDL showed that `schema.ts` lacked two unique constraints the real database had (one garden per household, one burn rate per crop and household). Both are now in the schema.
- The Playwright suite gives the same result as on `main` (217 passed; the Danish tests are gone). Its API setup calls now send an `Origin` header, which the suite's CSRF check requires for writes without a JSON body; browsers already send it.
- Nuxt builds its hashed files into `/assets/` so server-kit's `serveClient` caches them like the Vite apps' files.

## Step 2 built

- **The client is React in `apps/garden/src/client`**, laid out like Kvitt: a page per route, `household.tsx` for the user and active household, `api.ts` with a `useLoad` hook per page, error toasts, and Skymning with moss green as the signature (`ui/tokens.css`, `Logo.tsx`). No light/dark switch: the OS decides. The ~700 strings moved into `i18n/{core,plants,places,plan}.ts`; Swedish text that was hard-coded in the Vue templates ("i {plats}", "plantor", "Bed") got keys.
- **The canvas is `hooks/useGardenCanvas.ts`.** Zoom, pan, the pending selection and gesture state live in refs read by the `requestAnimationFrame` loop, so a drag never re-renders React; only the selection size is state. The layout is a ref owned by the page. New over the Vue version: it draws at the device pixel ratio, takes grid and selection colours from tokens (the canvas's own `border-color` and `color`), and erasing takes its undo snapshot before the stroke (the old one took it after, so undo did nothing). The bed popover now shows the bed's real plantings and kcal; they were always 0.
- **`AppShell` in `@homelab/ui` mounts `header` once**, in the sidebar or the phone header, whichever is showing. It used to render both, which doubled test ids (Playwright's strict mode failed on the household switcher and menu button) and mounted header widgets like Kvitt's `SyncStatus` twice.
- **Pure logic has unit tests in `src/client/lib`** (canvas maths, recurrence presets, yield, macro coverage, quantity format) and sits under the 80% coverage floor, which moved into `vite.config.ts` with the old Vitest and ESLint configs gone. The garden CI job is removed (it used too many minutes); coverage and Playwright run locally.
- **Playwright: 217 passed against the production build**, the same as step 1. Two test edits: a class check now looks for `text-danger` instead of the old `text-destructive`, and the build badge on Settings sits in the page's own `<header>`, since the shell's header is hidden on desktop.
- **Most of step 3 went into the same PR.** Once the React client passed the suite there was no reason to keep the old one: `app/`, the old `i18n/locales/*.json`, `nuxt.config.ts`, `.nuxtrc`, `components.json`, `.prettierrc`, garden's ESLint, Vitest and server tsconfig, and every Nuxt, Vue and shadcn-vue dependency are gone, along with garden's exceptions in the root README, CLAUDE.md and lint. The one integration test that read the JSON locales now reads `src/client/i18n/plants.ts`. Still open: go through the open items in `apps/garden/BACKLOG.md` (move to `docs/` or drop) and switch on demo mode per "Add an app" in CONTRIBUTING.md.

## Reasons

- Services already take the database as a constructor argument and import nothing from Nuxt, so the business logic and its tests move as they are. The cost is in the ~105 thin route handlers (mechanical) and the ~12 000 lines of Vue (the real work).
- Server first gives the suite's sign-in, build, Docker image and the per-request database that [demo mode](demo-mode.md) needs, and every existing unit, integration and E2E test can verify it before the client is touched.
- Nuxt's `ssr: false` means the client is already a plain SPA talking REST, so it can be served statically by the new server during the transition.

## Passed over

- **Porting page by page with Vue and React side by side.** Two frameworks, two routers and two design systems in one bundle for the length of the port.
- **An h3 compatibility shim** to keep the route files as they were. Faster, but keeps a global database and Nuxt idioms that step 3 would have to remove anyway.
- **Migrating the existing database.** No users, so a baseline migration is cheaper and cleaner.
