---
title: Demo mode with a throwaway database per visitor
summary: Portfolio visitors without an account try runplan, shopsplit and Etapp through /demo, each in their own capped, short-lived SQLite file
type: decision
status: accepted
updated: 2026-11-10
---

# Demo mode with a throwaway database per visitor

## Decision

Visitors coming from the [portfolio](portfolio-app.md) who have no account can try an app through `<app>.didrik.dev/demo`. Built for runplan, shopsplit and Etapp; Brygga needs none (it is already open and keeps data in the browser).

- **One SQLite file per visitor.** `/demo` creates `demo/<id>.db` next to the app's `app.db`, fills it with the app's demo data and sets a signed `demo_sid` cookie naming it. `/api` requests with that cookie are served by an app instance on that file, where the visitor is a fixed demo user (`authMode: "demo"`, never settable from the environment). Without the cookie, requests go to the real app. A visitor can't reach the real database or another visitor's data.
- **At most 100 demos per app.** When full, `/demo` says so instead of evicting someone mid-session.
- **2 hours without use**, then the file is deleted (sweep every 10 minutes and before each start; activity is the file's mtime, so it survives restarts). "End demo" deletes it at once. At most 20 demo databases are kept open; others are reopened on demand.
- **5 new demos per IP per hour** (in memory; `cf-connecting-ip` from the Cloudflare tunnel).
- **Nothing outside the file.** runplan can't connect Garmin in the demo; Etapp refuses photo uploads and its demo photo folder is never the real one.
- Sign-in itself moved to `packages/server-kit` too (`createAuth`, `loadAuthConfig`, `authTables`): the apps' `auth.ts` files were identical copies, and with the demo user built in, a new app gets sign-in and the demo's auth side for free. The steps for a new app are under "Add an app" in the README.
- The generic part (`createDemo`, `demoConfig`) is in `packages/server-kit`; `DemoBanner` and `DemoSignIn` are in `packages/ui` with shared strings. Each app adds only `openDemo` (open its app on a file, seed when fresh). Off by default in production; `DEMO_ENABLED=true` per app in `deploy/compose.yml`. `demo/` is left out of `backup.sh`.

## Reasons

- The main worry is the server disk. One runplan demo measured about 0.5 MB, shopsplit and Etapp far less, so the cap bounds each app's `demo/` folder at about 50 MB whatever the traffic.
- A file per visitor makes deleting a demo one file removal, whatever the app's tables look like. Deleting a demo user row would not work generally: in shopsplit and Etapp, households and trips are not owned by the user (memberships use `set null`).
- It reuses each app's full server logic, and the apps' own auth needs only a fixed demo user.

## Passed over

- **A shared demo account in Pocket ID with an invite link on the portfolio.** Pocket ID uses passkeys; an invite or one-time link is used up by the first visitor.
- **One shared demo user per app, reset every hour.** Least code and would cover garden as is, but visitors would see and could wreck each other's data between resets.
- **Demo users inside the real database.** Only the apps' scoping would separate strangers from real data; one bug there would leak it.
- **A client-only mode in localStorage.** Would mean running the server code in the browser (Hono, drizzle on sql.js) per app; much more work for a guarantee that matters less once demo data is separated, capped and short-lived.
- **One `demo.db` per app with throwaway users and sessions** (the first version of this PR). Worked for runplan, but purging a user leaves shopsplit and Etapp households and trips behind.

## Open

- **garden** (Autarki, Nuxt) reads one global database connection, so it can't swap files per request. Candidates: a separate `garden-demo` instance with a shared demo user and an hourly reset, or per-visitor households in a demo instance.
