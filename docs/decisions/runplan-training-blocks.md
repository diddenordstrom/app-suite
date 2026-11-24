---
title: runplan plans in training blocks
summary: Blocks replace phases; the plan is written, edited as text and judged per block; races are reminders with taper suggestions
type: decision
status: accepted
updated: 2026-11-24
---

# runplan plans in training blocks

*Partly superseded on 2026-11-24:* the "no cycle level above blocks" rule, by [race plan skeleton](fartlek-race-plan-skeleton.md). The rest stands.

Settled in a design interview (Nov 2026). Evidence behind it: [research/training-blocks.md](../research/training-blocks.md).

## Problem

The plan page has three parts that don't know about each other: `phases` only colour the week border, workouts don't know which phase or quick-add they came from, and quick-add text is thrown away after parsing (changing it means typing a new one and replacing weeks). There is no overview of how a period of training went. The fitness projection also filled every day up to the next A race with zero load, so it showed fitness ≈ 0 on race day.

## Settled

- **Fitness projection ends where the plan ends** (later: the end of the last block), not at race day. The caption reports fitness/form at the plan's end, and on the race only if the plan reaches it.
- **Blocks replace phases.** A block has a kind (base, build, specific/peak, taper, recovery), a free length and a name; hierarchy is block → weeks → workouts. ~~No extra "cycle" level above blocks.~~ *Partly superseded on 2026-11-24 by [race plan skeleton](fartlek-race-plan-skeleton.md):* before an A marathon or half a race plan (a skeleton of phases with a km target per week) sits above the blocks; blocks stay the unit sessions are made and judged in.
- **Workouts belong to a block by date**, not by foreign key. Moving a workout to another date moves it to whichever block covers that date.
- **Races are not linked to blocks.** A race is a reminder; the user plans blocks toward it, and the app suggests (e.g. taper 2 weeks before an A race: volume −40–60 %, keep intensity and frequency).
- **The quick-add text is a two-way view of the block.** Opening it renders the block's workouts back as one line per week (same grammar as quick-add). Saving it applies the difference:
  - Unchanged lines are not touched.
  - In a changed week, old and new sessions are paired by type in order. A paired workout keeps its day, notes and activity link and only gets the new distance/duration. New sessions go on free usual run days. Removed sessions are deleted only if planned and not linked to an activity.
  - Finished weeks are shown but locked (e.g. `✓` prefix); edits there are ignored with a warning, so text never rewrites history.
  - The number of lines is the block's length: adding a line extends the block a week, removing the last one shortens it.
  - Exact days and notes are what the text loses; the pairing rule keeps them.
  - Passed over: storing the original text (it would drift from the calendar as soon as a workout is moved), and replacing whole weeks on save (today's behaviour; loses moves, notes and links).
- **On track.** A block's status uses only what the plan states: volume (actual vs planned km over finished weeks, same tolerance as the month today: ≥ 85 %, or ≥ 70 % with at most one behind week) and key sessions done vs planned (threshold, intervals, long). Weeks keep today's rules.
- **Intensity is a separate signal, never part of the status**, because heart rate is noisy (heat, drift, lag in intervals). It is measured on the sessions planned as easy or long: share of their time in Z1–2, flagged under ~80 %, shown per block and as text in the week header. The block's full Z1–2/Z3/Z4–5 split is shown as plain info.
  - Passed over: Z1–2 share over the whole block with an expected share per block kind (penalises planned threshold work in build blocks), and a per-block user-set zone target (no need with one user; revisit if others use the app).
- **Pages.** Blocks live in the plan: a third view, Week / Month / **Block**, with a strip of the blocks and race flags (only in the Block view; week rows in Week and Month keep the block badge and coloured border). "Quick add" becomes **"New block"** (name, kind, start week, then the text). Races get their own simple page (`/plan/races`, races only) with the taper suggestion and volume/long-run hints; the phase form goes away. Workouts outside any block stay allowed and show as "no block". The long-run spike warning shows in the text preview and as a mark on the workout. **Block view layout = sketch A**: a proportional season timeline (blocks, race flags, today, gaps marked "no block"), a card for the selected block (volume, key sessions, easy sessions in Z1–2, longest run with the 30-day spike check) and one row per week (planned vs run km bar, key, easy %, status; click opens the week). **"Edit as text" opens sketch C**: the text on the left, a per-week preview of what will change on the right (kept days, new weeks, spike warnings, block length change) before saving. Passed over: B (block list + week table), denser but loses the time proportions. Sketches: the "runplan – Block-vyn, tre förslag" design canvas.
- **Block edges.** A block starts on a week start and is stored as start week + number of weeks. Blocks never overlap; gaps are allowed ("no block"). If extending a block would run into the next one, the app asks whether to push the next block on; it never moves blocks silently. Deleting a block keeps its workouts (they become "no block"); the delete dialog offers an unticked "also delete planned workouts not yet done", and "Clear…" remains for wiping ranges.
- **"Clear…" stays** as the way to wipe a range and start over.
- **Migration** of existing phases/workouts is low priority (one user today).

## Build order

1. Fitness projection stops at the last planned workout (independent, small).
2. `blocks` table replacing `phases` (kind, name, start week, weeks, note); calendar badge and border read blocks.
3. Block summary in shared code: volume and key sessions (reuse `summarizeMonth`), easy-session Z1–2 share, longest-run spike check.
4. Block view (sketch A) and "New block".
5. Text round-trip: serialise a block to lines, diff and apply with the pairing rules, preview (sketch C).
6. Races page without phases, with taper suggestion and volume/long-run hints.

## Built (Nov 2026)

All six steps are in (same PR as this page). Choices made while building, where the decision left room:

- **Projection end** is the later of the last block's end and the last planned workout, capped at 200 days; the Trends caption reports fitness/form there, and on the next A race only if it falls before that.
- **Migration**: `phases` became unnamed `blocks` (start snapped to the user's week start, whole weeks to cover the old end date, `peak` → `specific`), then the table was dropped. A block's name is optional; the kind label is shown when it is empty.
- **Key sessions behind** in a block means more than one missed *and* over a quarter of those planned in finished weeks; volume uses `summarizeMonth` on the finished weeks. Races are not key sessions in a block.
- **Pushing the next block on** moves its planned sessions and weekly targets with it, cascading only while blocks collide; a block that has started is never pushed (the save is refused instead).
- **Text round-trip**: an empty week is written `-`; a totals-only week stores `"N runs"` in the target note so it can be written back as `N km`; a manual km target on a week with sessions is kept when the line changes. Weeks added past the old end pick up any "no block" sessions already there and pair them like any changed week. Removing lines leaves those weeks' sessions as "no block".
- **"Planned workouts not yet done"** (delete dialog) = status planned, no run linked, dated today or later.
- **Long-run check** compares each planned run (not races) with the longest run in the 30 days before it, using runs done where they are past and planned runs ahead.
- **Race hints** (Races page) use weeks 6–2 before race week: average weekly volume (run where past, planned where ahead) and the longest run, against the Fokkema bands; A races get the taper suggestion with the cut worked out from that average.
