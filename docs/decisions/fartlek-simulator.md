---
title: Fartlek's plan simulator runs the whole road for a made-up runner
summary: "npm run sim" and POST /api/sim put a runner described in JSON into an in-memory database and run Skapa block block after block up to the race through the real app, every session run as planned, to compare the engine with other plans without touching the code; a first comparison with a free 12-week intermediate marathon plan
type: decision
status: accepted
updated: 2026-11-25
---

# Fartlek's plan simulator

Asked for by the user on 2026-11-25, to compare the engine with other plans "without hacking the codebase". It builds on the planning scenarios ([fartlek-key-sessions-first.md](fartlek-key-sessions-first.md)), which only plan the next week or block for hard-coded histories.

## How it works

- **Input:** a runner in JSON (`SimInput` in [`server/simulate.ts`](../../apps/fartlek/src/server/simulate.ts)): km per week before the start, run days, long-run day, gym and cross-training days, doubles, threshold pace and heart rate, an optional race (weeks out, distance, goal time), the rhythm, the answer to the race-pace question, whether to say yes to "add a run day", and engine tuning overrides (`tuning`, as in the developer settings). Examples live in [`apps/fartlek/sim/`](../../apps/fartlek/sim).
- **Run:** a fresh in-memory database and the real app. The clock is pinned to that database only (`pinToday` in `analysis.ts`), so the simulator never moves the date for real users. Each round sets today to the day before the next block, calls `GET /plan/block-suggest`, answers the race-pace question if asked, writes the block with `POST /plan/block-suggest`, then "runs" every planned session as planned (runs at easy, long or threshold pace by type, gym and cross-training as their own activities, the race at the goal time) and moves on to the next block, up to the race week.
- **Caveat: form runs deeper than in real data.** The made-up runs get a fixed heart rate per session type, and their load digs form deeper (about −30 % in build weeks) than real runs of the same km often do, so the form guard brakes the simulated plan earlier than the real one. Read volume and long runs as a lower bound.
- **Output:** every week's block, role, phase, run km, long run, sessions as short codes, the deepest form and fitness, race-day form, and what the planner asked along the way.
- **Two doors:** `npm run sim -w apps/fartlek -- sim/<runner>.json` (add `--json` for the raw result), and `POST /api/sim` for a signed-in user (`?format=text` for the table). The endpoint reads and writes nothing of the caller's, runs one simulation at a time per server, and uses the default engine tuning, not the caller's.

## First comparison: a free 12-week intermediate marathon plan

The runner from `sim/intermediate-marathon-12.json`: about 40 km a week on five days, an 80-minute long run, a marathon 12 weeks out. The free plan it was compared with is time-based (4.5 to 7 hours a week, two quality sessions a week, VO2 hills or intervals and tempo or progression runs, long runs from 1 h 20 to 2 h 30, 2 × 15 min strength).

What the simulator showed for the engine (after the [low-volume changes](fartlek-low-volume-growth.md) of the same day): 28 → 50 km a week with a 3:1 rhythm and a two-week taper, one quality session a week that becomes the marathon phase's race-pace sessions, race-day form about +8, and a **longest run of 21 km** (18 km before the changes).

- The engine is more careful with intensity (one quality session a week, lighter weeks that also ease the intensity) and ties the volume to proven load and form, where the plan prescribes the same hours to everyone.
- The longest run is still the gap. The long-run ladder (+8 % a step, at most 10 % over the longest run of 30 days) can't take a runner from 13 to 28–32 km in twelve weeks, and the plan's 2 h 30 is about 25 km for this runner. Twelve weeks is short for a marathon in Fartlek's own road too: the race plan wants more weeks before it.
- A bug in the first version of the simulator ran sessions with steps (threshold, strides) as zero km, so the planner saw too little history and shrank the plan; numbers from before the fix are wrong.

## Open questions

- Should a marathon road that is too short for the long-run ladder say so plainly, with the longest run it will reach, before the runner commits? Or should the ladder step faster in a marathon plan, within the 30-day rule?
- Should the base engine have a VO2max or hill dose? Many plans keep one in the base phase; Fartlek has threshold and strides until the race phase.
- A time cap on the long run for slower runners (about 2.5–2.75 h) beside the 30 km / 3 h ceiling ([fartlek-long-run-ceiling.md](fartlek-long-run-ceiling.md)).
- Short strength (15 min) on a run day, as an alternative to a whole gym day ([fartlek-gym-cross-days.md](fartlek-gym-cross-days.md)).
