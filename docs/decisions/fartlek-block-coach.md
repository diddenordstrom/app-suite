---
title: Fartlek's block editor coaches on form and km ramp before saving
summary: The block editor projects form (TSB) and the weekly km ramp (ACWR) for the text being typed and suggests changes in a fixed order; other sports count as a weekly habit; quick-add, a list view and a week calendar sit beside the text, which can hold steps inline
type: decision
status: accepted
updated: 2026-11-12
---

# Fartlek's block editor coaches on form and km ramp before saving

## Problem

A block written too gently keeps form (TSB) near 0 instead of in the −10 to −25 band the app calls building ([load.ts](../../apps/fartlek/src/shared/load.ts) `FORM`). The editor only showed which sessions change, so the runner found out weeks later in Trends.

## What the mock taught us

TSB is load compared with the last six weeks, not how hard training is. A steady block always drifts to 0 whatever its volume. Simulated with the app's own model: +10 % a week inside a km ramp of 1.3 only just reaches −10 in the hardest week; a block *average* of −10 needs ramps past the injury limit. So the coach cannot judge the average.

## Decision

- **Projection** for the block in the editor: actual load up to today, then planned load per day (from the text being typed inside the block, planned workouts outside it) plus the weekly habit of other sports, through the block's end (or race day). A workout with steps is loaded step by step (`stepsLoad`), not at one intensity for the whole session.
- **Base mode is judged on the deepest build week**: the lowest daily form in any open, non-backoff week. Under −10 is the goal, above it is "too easy", below −30 or a weekly km ramp over 1.4 is "too hard". Backoff and finished weeks are never judged and get no suggestions.
- **Race mode** when an A or B race falls inside the block or up to 28 days after it: judged on form on race day, goal +5 to +15.
- **Km ramp** per week = the week's run km / the mean of it and the three weeks before (as the Dagsform's km signal, [fartlek-readiness](fartlek-readiness.md)). Other sports never count in it: it is there for tendons and joints.
- **Suggestions, in this order** (each shown with its effect, "form −5.5 → −9.4", and applied by rewriting the text; nothing is saved until Save):
  - too easy: more volume (at most +10 % on the week before *and* a ramp of at most 1.3), longer threshold reps (+2 min), 45 min of another sport, one easy run turned into a threshold session;
  - too hard: shorten the long run, drop the last easy run, or swap it for the same time on a bike;
  - race, tired on race day: cut the week before by 30 %, halve the reps in race week, trim race week's easy runs.
  The limits are `COACH` in [shared/coach.ts](../../apps/fartlek/src/shared/coach.ts); the UI reads them, never its own numbers.
- **Other sports are a weekly habit, per block**: "annan träning per vecka", minutes of zone 2 in other sports together, prefilled with the mean of the last 6 weeks' non-run activities, stored on the block (`cross_min`, null = follow the history). Counted at intensity 0.65 spread evenly over the week. A `cross` session written in a week's line (`45min cykel`) comes **on top** of the habit. Without the habit the projection would read a missing bike ride as resting and ask for more running.
- **Steps inline in the block text**: `9.8 tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt)`, the same step grammar as the workout dialog inside parentheses; the amount comes from the steps. The old `*` marker is still read (keep the workout's steps). The block text is written in the UI language (`lugnt`, `långpass`, `tröskel`, `avlastning`), and read in both.
- **Editor layout**: quick-add buttons above the text (Lugnt, Tröskel, Långpass zon 2, Annan träning) open a small popover under the button for the amount and add to the selected week's line; a Text / Lista switch shows the same lines as removable chips; a week calendar (Mon–Sun per week, changed days outlined) replaces the "what changes" list.

## Passed over

- Judging the block average (unreachable inside the ramp limit) or form at the block's end (a closing backoff week puts it near 0).
- A wizard instead of the text: the text is fast and the suggestions can rewrite it; a wizard could later become a "new block" starter producing the same text.
- Per-session cross training only: nobody writes every swim into a running plan.

## Open

- A session library to add your own quick-add templates: put off, see [fartlek-session-library.md](fartlek-session-library.md). The grey "Spara som mall" button was removed until then.
- Whether the race band should depend on distance (a marathon taper is longer).
