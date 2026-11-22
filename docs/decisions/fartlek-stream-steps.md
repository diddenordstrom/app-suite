---
title: Fartlek step detection from the stream
summary: When a run's laps don't fit its workout's steps, the step changes are found in the 1 s stream (grade-adjusted, Garmin's GAP when present) and offered as a full set of lap splits; method, thresholds, what the real runs showed, and what's open
type: decision
status: accepted
updated: 2026-11-12
---

# Fartlek step detection from the stream

Build order 6 of [structured workouts](fartlek-structured-workouts.md), built on 2026-11-12. Asked by the user: "how much effort is it to match the Garmin streams to the workout we created, so we aren't fully reliant on laps?" Read the structured workouts page first; this page only adds the stream part.

## Goal

When a run's laps don't line up with its workout's steps (only auto-laps, a forgotten lap press, an extra press in the warm-up), find the step changes in the stream instead, so each step can still be judged.

## Settled

- **A fallback and a suggestion, not a replacement.** When the laps fit, nothing changes and nothing is detected. When they don't, the "Plan mot utfört" card offers what the stream shows ("Hittade 3 drag i strömmen. Använd dem?") with each rep's time and pace. It is never applied without asking. The lap-based table stays below it, headed "Enligt varven, som nu".
- **Accepting stores a full set of lap splits** (`activity_splits`, one per step change), replacing any earlier splits. **K−1 splits for K steps means the splits alone mark the steps** and the laps only give their numbers ([`matchSteps`](../../apps/fartlek/src/shared/stepmatch.ts)). This is what makes an *extra* lap press fixable, which cutting laps alone can't do. Undo clears them as before. Laps, streams and the Garmin data are never touched.
- **The split box's default** (a forgotten lap press) is where the pace clearly changes within ±25 % of the plan's point, else the plan's point (`refineMerged`).
- **The plan is known.** This only places the K−1 boundaries between K known steps; it is not interval detection in an unknown run ([fartlek-interval-laps](fartlek-interval-laps.md)).
- **No new stored data.** Detection parses a 1 s stream from the kept FIT file on demand (`parseFit(bytes, 1, { gap: true })`) and throws it away; `DETAIL_VERSION` is unchanged. Without a kept file (demo, old activities) the stored 5 s stream is used. It runs only on the activity page, never for the plan's week chips.

## How it works

[`shared/streamsteps.ts`](../../apps/fartlek/src/shared/streamsteps.ts), thresholds as constants at the top:

1. **Timer clock.** Gaps over 10 s are pauses and are dropped. Below 1 m/s counts as standing.
2. **Grade-adjusted speed.** Garmin writes its own in every record, in the **undocumented field 140** (mm/s, what Connect shows as GAP). It is believed only within 0.6–1.6× of the real speed. Without it (older watches, treadmill) Fartlek estimates it from the altitude with the same shape, fitted to the user's two files: about +3 % per 1 % uphill, and a floor of 0.91 downhill (Garmin's flattens out near −9 %). "3D speed" in Garmin is a different thing (speed including vertical movement) and doesn't help.
3. **Dynamic programming** on a 2 s grid (15 s rolling median) picks the boundaries that keep grade-adjusted speed even within each step. Each step's length is pulled toward the plan: a 20 % miss costs one weight on reps, a 50 % miss costs a third of one on easy steps. Standing is free in an easy step (a standing rest) and costs a little in a rep, so a rep isn't stretched over the stop after it but a red light in a tempo run doesn't move its ends. The first and last steps take whatever the run starts and ends with (a walk home).
4. **Refinement** moves each boundary to the sharpest change, in the direction the plan says (rep start up, rep end down), within 12 s at full resolution.
5. **Confidence: say nothing rather than guess.** No suggestion unless:
   - every boundary is between a hard (`work`) and an easy step: two easy steps in a row could only be split by the clock;
   - every boundary shows a ≥ 10 % jump;
   - every rep is ≥ 10 % faster than the steps beside it, and at most 20 % of it sags below the midpoint (a fartlek or a progressive run);
   - every rep is within 25 % of its planned distance or time;
   - no easy step holds a stretch at rep effort longer than 60 % of the shortest rep (more reps run than planned; strides are fine);
   - with the splits applied, every step starts within 15 s of where the stream says;
   - the stream doesn't just agree with the laps already there (a rep that simply ran short).
6. **When to look.** The laps "don't fit" when a step has no lap, a lap covers two steps, or a rep's lap is more than 30 % off its planned amount.

## What the real runs showed

The user attached two runs; they are test fixtures as JSON (laps plus the 1 s stream with GAP, no positions or date) in `apps/fartlek/src/shared/fixtures/`.

- **Hill reps** (3 × ~435 m at ~5.5 %, max effort, jog down): manual laps at every step change, so they are the reference. With the laps hidden, detection lands 1–9 s after each press, with Garmin's GAP or the estimate. The runner **presses lap, stands a few seconds, then goes**, so the cut falls where running starts, which judges the rep's pace better than the press does.
- The same run's real laps exposed two **gaps in the lap matching** (phase 1): an extra press in the warm-up shifted every step one lap, so "Drag 1" was the 1.8 km warm-up lap, silently; and the 2 s `session_end` lap became its own segment. The lap-off check (step 6 above) now catches the first, and the stream's full set of splits fixes it.
- **Tempo with a climbing end** (watch workout: 10 / 16 / 10 min): the last 4 min of the tempo slow from 4:45 to 5:35 uphill, which isn't taken for a step change. The watch workout's laps are `time` triggers, which phase 1 treats as auto-laps. Here warm-up and tempo differ by less than the 12 % pace shift, so they merged and the stream suggestion is what fixes it.

## Tests

`streamsteps.test.ts`:

- **Real runs:** the reference runs; plans that don't fit what was run (5 or 2 reps for 3, 1 km for 435 m, intervals for a tempo); two easy steps in a row.
- **Synthetic** (seeded noise):
  - 8 × 200 m with a standing rest and a paused warm-up;
  - a treadmill run with no altitude;
  - uphill reps barely faster than the flat warm-up;
  - a red light inside a tempo;
  - a progressive run and an unstructured fartlek, which must give nothing.
- **Matching and the API:** `stepmatch.test.ts` covers a full set of splits and a split on an auto-lap's end; `app.test.ts` covers the `all` body and the demo's auto-lap run. The demo's threshold run last week has auto-laps only, so the suggestion can be seen in demo mode.

## Open

- **Watch workouts' `time` laps** are treated as auto-laps by phase 1. The FIT file has `workout_step` messages; reading them would let the laps fit directly. Small, worth doing.
- More real runs to tune against: short reps on a track, a treadmill, a fartlek. The user will run them; the synthetic cases stand in until then.
- Speed: ~50 ms per detection on the dev machine, plus a 1 s FIT parse, only when a run's laps don't fit. Measure on marvin if the activity page feels slow.
- Announced as a bullet in the November [what's new](whats-new.md) note, no tour.
