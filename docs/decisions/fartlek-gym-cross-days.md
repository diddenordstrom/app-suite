---
title: Fartlek asks which days gym and cross-training go on (plan, not built)
summary: Plan for the block planner to ask how many gym sessions and which days, and which days and minutes for cross-training, so the engine places them there and keeps the run days apart from them
type: note
status: open
updated: 2026-11-18
---

# Fartlek asks which days gym and cross-training go on

Raised by the user on 2026-11-18, after [gym became its own session type](fartlek-gym-sessions.md). **Nothing here is built;** this is the plan to pick up another day. The estimate comes from what was seen of the code in that session, not from a full read of the planner, so check the engine first.

## Idea

- In Skapa block and Föreslå vecka, ask something like: "At least one gym session a week is recommended to keep knees, tendons and hips under control. Which day or days do you want to gym on?" (Swedish wording to be written; the app doesn't say how to train, only that and when.)
- For cross-training: "You chose 30 min of cross-training. Which days?", answered as minutes per day (30 min Thursday, 60 min Saturday).
- The engine then places those sessions on the days given and plans runs around them, which ties in with the days the runner can run ([fartlek-run-days.md](fartlek-run-days.md)).

## What exists

- `Block.crossMin` (minutes a week of other sport) and a cross item placed on a free day in [`shared/nextweek.ts`](../../apps/fartlek/src/shared/nextweek.ts) (`shape.crossMin`).
- The "which day to add" dialog for run days (`MoreDays` in [`client/suggestweek.tsx`](../../apps/fartlek/src/client/suggestweek.tsx)): a question after the simulation, answer saved to the settings, simulate again.
- `Settings.runDays`, and a note in [fartlek-block-progression.md](fartlek-block-progression.md) about days the runner can't run (gym, swimming).
- The `strength` workout type and matching, with the engine skipping it (`workoutWeeks`).

## Plan

1. **Data (small to medium).** Per block, since the load changes through the year (two gym days a week in the winter, one in peak season to make room for running). Add `gymDays` (e.g. `[1]`) and `crossDays` (minutes per weekday, e.g. `{4: 30, 6: 60}`) to `Block`, next to `crossMin`: a migration and validation in the block routes. `crossMin` becomes the sum of `crossDays` or is replaced by it. Settings keep only a default (`gymDays`, `crossDays`) that a new block starts from and the question pre-fills, so the runner doesn't retype it each block.
2. **Engine (medium, the hard part).** Place gym and cross on the stated days instead of a free day. Take those days out of the days runs may use, and make the "needs another run day" advice (`daysAdvice`) count only real run days. Avoid a threshold or interval session the day after gym and prefer an easy (zone 2) run there. This is a soft rule: the engine tries other days first and only breaks it when nothing else fits, so it never becomes an unsolvable week. Most existing scenarios in `server/scenarios.test.ts` depend on day placement, so expect to update them.
3. **Dialog (medium).** A new step under the same conditions as the run-day question (not for a block already running; for a running block the days are edited on the block itself). Gym: chips for the days, "none" is a valid answer. Cross: one minutes field per chosen day, not free text. The answer goes on the block and the simulation runs again; the settings default is only updated if the runner says so.
4. **Texts and docs.** `t()` keys in `en` and `sv`, this page updated to a decision, a log entry, `npm run docs:index`.

Estimate: 1–2 days. Data and dialog are quick; the engine and its tests take most of it.

## Reference week

The user's winter schedule, to use as a scenario test when the engine work starts:

| Day | Session |
|---|---|
| Monday | gym |
| Tuesday | zone 2 (easy after gym) |
| Wednesday | rest, or threshold, depending on Friday |
| Thursday | swimming (cross) |
| Friday | zone 2, or threshold, depending on Wednesday |
| Saturday | rest, or 60 min bike (cross) |
| Sunday | long run |

So: gym on Monday and cross on Thursday and Saturday, runs on Tuesday, Wednesday, Friday and Sunday. Only one of Wednesday and Friday carries the threshold session and the other is easy or rest, which means the engine picks between two candidate days rather than being told.

## Decisions on the way

- Settled 2026-11-18 with the user: **the app doesn't suggest what to do in the gym**, only the recommendation and the question about days. No focus text, template or session note.
- Settled 2026-11-18: the engine tries to avoid a threshold session directly after gym and puts easy running there instead, as in the reference week.

## Open questions

- Whether gym, once placed, should block the day itself for the longest run or other key sessions (the reference week has none of that: gym on Monday, long run on Sunday).
