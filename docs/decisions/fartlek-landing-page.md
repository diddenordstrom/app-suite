---
title: Fartlek gets its own landing page on the portfolio, built from live components
summary: /fartlek on the portfolio renders Fartlek's real components on hand-tuned demo data (no screenshots), with a theme toggle; the Fartlek card says "Läs mer" instead of "Öppna appen"; "öppen källkod" (present tense) without a GitHub link; about/contact waits for the owner
type: decision
status: accepted
updated: 2026-11-20
---

# Fartlek gets its own landing page on the portfolio

## Decision

- `apps/portfolio` serves a landing page for Fartlek at `/fartlek` (components in `apps/portfolio/src/client/components/fartlek/`, copy in `src/client/i18n/fartlekLanding.ts`). It sells Fartlek to self-coached runners: hero, short pillars, one section per feature, the formulas behind the numbers, the research, FAQ and a demo call to action.
- **Live components, not screenshots.** Each feature section renders Fartlek's own React components (imported from `apps/fartlek/src/client` through the `@fartlek/` alias; the few cards Fartlek writes inline are copied and named in `live/screens.tsx`). Fartlek exports `Score`, `Sessions`, `WeekList`, `SignalList` and `SeasonStrip` for this. They follow the page's theme (light/dark/auto toggle in the header) and language, and never go stale against a redesign the way images would.
- **Hand-tuned demo data.** The components are fed a snapshot of the demo account's API responses (`components/fartlek/data/demo-snapshot.json`), tuned so the story reads well (a ~3:30 marathoner, no knee pain, a steady fuelling progression) while keeping Fartlek's own formulas. `scripts/fartlek-landing-tune.py` reapplies the tuning to a fresh export; see the data README. Block, run and activity names in the snapshot are translated by the page at render time (`DEMO_NAMES`), so the demo does not mix English and Swedish.
- **"Läs mer" replaces "Öppna appen"** on the Fartlek card on the portfolio front page (an app with a `page` gets "Testa demon" plus "Läs mer"); the other apps keep "Öppna {name}".
- **"Öppen källkod", present tense, no GitHub link yet.** The page is merged when Fartlek goes open source, so it talks about open source as a fact (MIT, host it yourself, the source shows how) and never as a promise. It links to no repository for now, in line with [the portfolio showing the apps, not the source](portfolio-app.md).

## Reasons

- Screenshots would need redoing for every UI change and both themes; live components cost a few exports and a type-cast snapshot, and a Fartlek type change shows up as a broken section in review rather than a silently outdated image.
- Fixes found while building the page went into Fartlek itself, since the app had the same bugs: race names on the season strip now account for which way each label points, and distances use the language's decimal mark (`12,4 km` in Swedish).

## Open

- The "Om mig / Kontakt" section is a placeholder (`PLACEHOLDER TODO`) until the owner writes it.
