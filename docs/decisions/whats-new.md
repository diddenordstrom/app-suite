---
title: What's new popup and "Show me" tours
summary: A short Swedish note shown once after a release that changes how an app is used, with an optional spotlight tour behind "Visa mig"; stored like tours, shared by all apps
type: decision
status: accepted
updated: 2026-11-11
---

# What's new popup and "Show me" tours

Asked for by the user (Nov 2026) while building [structured workouts](fartlek-structured-workouts.md): "big changes like these need a changelog the user sees on a new release. Swedish is enough. Maybe a spotlight behind 'Show me'."

## Decided

- **A popup, not a page.** After a release, the newest entry is shown once in a dialog titled "Nytt i <app>": a short title, the date and a few bullets. Buttons: **Stäng**, and **Visa mig** when the entry has a tour.
- **Swedish only for the entries.** The apps' home language; the user said Swedish is enough. The buttons and title around them go through `t()` like every other string.
- **Written when a release changes how the app is used** or needs something from the user (a resync, a new field to fill in). Bug fixes and polish don't get an entry.
- **"Visa mig" runs a spotlight tour** (`packages/ui` tour), built from `data-tour` targets like the first-login tour. A tour may open a dialog and spotlight inside it: the spotlight layer sits above dialogs. A tour may be built async when "Visa mig" is pressed, so it can find what to show: Fartlek's planned-vs-actual tour opens the user's latest run with steps (`/activities/latest-structured`), and without one shows a single card saying what will appear.
- **Seen once per user, not per device.** Entries are marked seen as `news-<id>` in the same list as tours, so an app that stores tours on the server (Fartlek) doesn't show a note again on another phone. "Show the tour again" in Settings replays tours but keeps read notes read.
- **Not for brand-new users.** The popup waits until the first-login tour is done; a new user learns the app from that tour, not from release notes.
- **All entries in Settings** under "Nyheter", each with its own "Visa mig".
- **Shared code.** `WhatsNew`, `NewsList` and `NewsEntry` live in `packages/ui` (`news.tsx`); each app keeps its entries in its own `client/news.ts`, newest first. Fartlek uses it first; Kvitt and Etapp can add it when they have something to say.

## Open

- Apps without server-stored tours would show a note per browser; fine until one of them needs it.
