---
title: Web Push is shared: server-kit sends, packages/ui subscribes
summary: How every app can send notifications to the installed PWA (iOS home screen included): VAPID keys made on first use, one subscription per device, the app decides what and when
type: decision
status: accepted
updated: 2026-11-20
---

# Web Push for the suite

Asked for Fartlek's morning notification, built so Autarki and the others can use it too.

## Decision

- **Server, `@homelab/server-kit` (`push.ts`)**: `pushTables(users)` (spread into the app's schema like `authTables`), `createPush(...)` with `routes()` (`GET /push`, `POST|DELETE /push/subscriptions`, `POST /push/test`), `sendTo(userId, message | (lang) => message)` and `subscribedUsers()`. Daily sends get `dailyDue(now, timezone, "HH:MM", lastSentOn)` and `startTicker`. The app owns what to send and when; the shared part only gets a payload `{ title, body, url, tag }` to every device the user has.
- **Client, `@homelab/ui`**: `PushSettings` (on/off for this device, test, the app's own options as children) and `usePush`; `pushServiceWorker()` from `@homelab/ui/vite` adds `push-sw.js` (show the notification, open the app on tap) to the build, imported by the Workbox service worker with `importScripts`. Strings are in `packages/i18n` (`push.*`).
- **VAPID keys are made on first use and kept in the database** (`push_keys`), the private key encrypted with the app's master key when it has one. A deploy needs no new secret; `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` override them, `VAPID_SUBJECT` the subject (default: the app's https public URL; Apple refuses localhost).
- **One row per device** (unique endpoint). The same browser signing in as someone else takes the endpoint over. A push service answering 404/410 removes the row; the client re-registers a subscription the server has lost.
- **The device's language goes with the subscription**, so the server writes the text in it: the client dictionaries read the language once in the browser and can't run on the server.
- Off in demo mode (`enabled: false`, the card hides itself).

## iOS

Web Push works on iOS/iPadOS 16.4+ only for a PWA added to the home screen, and permission must be asked from a tap. The card says so when Safari isn't running the installed app, and when notifications were denied (then only the phone's settings can turn them back on).

## Passed over

- A push service (Firebase, OneSignal): a third party for something the standard does, and it would see every message.
- VAPID keys as Komodo secrets from the start: one more secret per app for no gain on a single server; the override is there if wanted.
- Shared scheduling tables (a generic "daily at" per user): each app's timing differs (Autarki's would follow the garden), so the app keeps its own row and uses `dailyDue`.
