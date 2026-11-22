---
title: Kvitt landing page on the portfolio
summary: What /kvitt pitches (free, open source, one account per group, trip or ongoing), how it compares with Splitwise and Steven, and why its screen is drawn rather than live
type: decision
status: accepted
updated: 2026-11-22
---

# Kvitt landing page on the portfolio

`/kvitt` on the portfolio, linked from Kvitt's card ("Läs mer"), like [the Fartlek page](fartlek-landing-page.md). Code: [`components/kvitt/`](../../apps/portfolio/src/client/components/kvitt/), copy in [`i18n/kvittLanding.ts`](../../apps/portfolio/src/client/i18n/kvittLanding.ts).

## Decision

1. **A short pitch for groups of friends**, two to three minutes of reading: hero, four pillars (completely free, open source, no ads or limits, no data sold), one account per group, "one trip or for good", three extras (couples as one wallet, Swish with the amount filled in, fewer payments), a comparison, three FAQ, the demo.
2. **One account per group is its own band.** Only the person who starts the group signs in (Pocket ID); everyone else joins with a link and a name. It's the thing a group notices first next to Splitwise and Steven.
3. **An honest comparison with Splitwise and Steven**: a table (price, ads and limits, who needs an account, Swish, currencies, app, open source) and one line per app on when it's the better pick. Kvitt's gaps are stated: one currency per group, no App Store app, Swish opens outside the app, one-person project.
4. **The hero screen is drawn**, with the portfolio's tokens, not Kvitt's live components. A balance screen with a couple wallet and a "kan vänta" payment says enough; wiring Kvitt's components and demo data in like Fartlek's page was not worth it for one screen.

## Facts in the comparison (checked 2026-11-22)

- Splitwise free: ads and a daily cap on new expenses (the App Store reply says four; reviews report three to five by region); Pro about $40 a year; currency conversion with Pro.
- Steven: Swish built in (Sweden), payments registered automatically, reminders; Premium from 19 kr a month on the Swedish App Store; no ads.

Re-check them before changing the copy. Steven's exact Premium features weren't findable, so the page names only its price.

## Open

- **Name clash:** an unrelated App Store app is called "Kvitt - Split with Friends" (Swish, Vipps, MobilePay). Worth knowing before marketing Kvitt more widely.
- About/contact waits for the owner, as on the Fartlek page.
