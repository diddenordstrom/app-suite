---
title: Fartlek "Mål till plan": from a goal to a plan in two minutes, on Garmin history
summary: Plan for the first screen a new runner meets (race or time goal, date, run days), built on Garmin history: phases with the first block concrete, beside "Skapa block"
type: decision
status: accepted
updated: 2026-11-20
---

# Mål till plan

Planned on 2026-11-20, after comparing Fartlek with Runna (see the [roadmap](fartlek-roadmap.md)): Runna's core is "pick a race and a goal, get a plan", and in Fartlek that path exists ("Skapa block" counted back from a race, [race blocks](fartlek-race-blocks.md)) but only after the runner has found the plan page, entered a race and has Garmin history. This plan makes it the first thing a new runner does once Garmin is connected. Nothing is built yet.

## One engine, one way of training (decided 2026-11-20)

Mål till plan is a new **entry** to the engine, not new training logic. Every runner gets the same method whatever the goal: easy running, the long run's step, the threshold ladder, lighter weeks, the taper. The goal only sets **where the plan ends** (date), **what the paces are aimed at** (goal time) and **whether there is a taper**. No branches per distance or goal ("threshold only if x, y, z, else 800 m VO2max"): the engine is already complicated, and every rule should stay one the runner can read in an ⓘ. A new rule has to earn its place across all runners, not one goal.

## What already works (reused, not rebuilt)

- Race planning backwards from an A or B race in 4-week blocks, taper searched against race-day form ([race blocks](fartlek-race-blocks.md)), through the one engine entry `planRange`.
- Run days and long-run day (settings), gym and cross days per block ([gym and cross days](fartlek-gym-cross-days.md)).
- Goal pace and needed threshold per race (`goalPace`, `neededThreshold`), race predictions from history ([best efforts](fartlek-best-efforts.md)).
- The engine's no-history start (`noHistory` → `NEXT.startKm`, 15 km) and its injury guards.

## The flow (draft)

One dialog, four short steps, phone first; every step has a sensible default so "Nästa" all the way works.

1. **Mål**: a race (name optional, distance 5 / 10 / 21.1 / 42.2 or own, date), or without a race "Bli snabbare på X km" (a PB is this goal) or "Tillbaka efter uppehåll".
2. **Var du står nu**: read from Garmin and shown to confirm (km per week lately, longest run in 30 days, form, best efforts and the predicted time). A recent race not in Garmin can be added here.
3. **Mål-tid**: the goal time, with Fartlek's realism check beside it ("Med dina siffror: ungefär 1:52. 1:45 kräver tröskel 4:40/km, i dag ungefär 4:55"). "Bara ta mig i mål" is a choice.
4. **Veckan**: run days and long-run day (today's settings), gym yes or no.

Then **the plan**: the whole road to the race as phases on one screen (in fas → uppbyggnad → formtopp, with weeks and km per phase), the first block with real sessions, and "Starta". The later blocks are made when the one before ends, as today, so the runner follows one block at a time.

Entry points: right after Garmin is connected in the first-login tour, and a "Nytt mål" button on Home and Plan. It sits **beside "Skapa block"** (decided 2026-11-20): Mål till plan sets a new goal, "Skapa block" makes the next block toward it; the same engine either way.

## Garmin is required (decided 2026-11-20)

The point of Fartlek is placing the runner exactly in the build from real training load; a plan on self-reported km would be the guesswork the app exists to replace. So the flow starts after Garmin is connected, and the first sync already pages back through the history. A runner with **less than about four weeks** of runs in Garmin (a new watch) gets an honest start: "Vi känner inte din träning än", a short base block from the engine's no-history start (`NEXT.startKm`) while the data comes in, and the goal plan from the first Monday check-in with enough history.

## What has to be built

1. **Reading where the runner stands** for step 2: weekly km, longest run, form and best efforts from the history (all exist), and the too-little-history check above.
2. **The realism check** for step 3: today's prediction for the goal distance (exists for races) against the goal, the gap in seconds per km and the threshold it needs (`neededThreshold`). Shown, never a rule that changes the plan.
3. **The whole road as a preview**: `raceChunks` already counts the blocks; the preview needs km per phase without generating every session (decided: phases with km, the first block with real sessions).
4. **Goals without a race**: "Bli snabbare på X km" as a time goal on a date the runner picks (planned like a race toward a time trial, so the taper and the check work the same), and "Tillbaka efter uppehåll" as a target end week back at the load before the break (the engine's re-entry already aims there).
5. **Strings and the dialog** (shared UI where it fits), sv and en.

## Deliberately later

- **Not planned: distance-specific training** (5 km intervals vs marathon long runs). Every distance gets the same method (see above); this was out of scope in [race blocks](fartlek-race-blocks.md) and now stays out by choice, not for lack of time.
- Strength content (an exercise library), audio cues, a native app.

## Open questions

- "Bli snabbare på X km" without a booked race: does the plan end in a time trial week the app puts in the calendar, or just a target date?
