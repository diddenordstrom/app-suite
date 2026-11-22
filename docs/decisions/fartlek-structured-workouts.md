---
title: Fartlek structured workouts and planned vs actual
summary: Planned sessions get optional steps with pace/HR targets; laps are matched to the steps and each step is judged in target / near / off, with a lap split for forgotten presses and step changes found in the stream (built); the session library put off
type: decision
status: accepted
updated: 2026-11-12
---

# Fartlek structured workouts and planned vs actual

Settled in a chat with the user (Nov 2026) while comparing Fartlek with TrainingPeaks. Structured workouts were the gap with the most value; planned vs actual depends on them, so both live on this page.

## Problem

A planned workout is a type plus distance or duration (`9 tröskel`). A session like "3 × 8 min at threshold, 2 min jog" exists only in the name the runner gives the watch. So Fartlek can say *that* a threshold session was done, but not whether the reps were the right length, at the right pace, or how the last rep compared with the first. The lap table's "intervall · rätt fart" tag ([fartlek-interval-laps](fartlek-interval-laps.md)) guesses the work laps without knowing what was planned.

## Settled

- **One page, one feature.** The step format decides what can be compared, so structure and planned-vs-actual are designed together.
- **Out of scope here:** a library of saved sessions and block templates (builds directly on this, next in line), sending workouts to the watch (later solved via intervals.icu: [fartlek-watch-push](fartlek-watch-push.md)), a combined multi-series chart, and a map (Garmin Connect has one, and the elevation profile explains more).

## Settled in the mock review (2026-11-11)

The proposal below was mocked as a Claude Design canvas ("Fartlek – strukturerade pass", four boards: the workout dialog, the week, the activity page, the phone) and reworked once after a self-critique. The user accepted version 2 and said to build. What the review added or changed:

- **Language.** All code stays English; Swedish is only UI. The step keywords follow the UI language: the parser reads both (`@tröskel` and `@threshold`, `lugnt` and `easy`) and steps are written back in the user's language. The block text should work the same way; today it is English only, which is its own fix.
- **Targets come from what Fartlek already knows**, nothing invented:
  - Easy, long, warm-up and cool-down steps are judged on the **easy HR band** from Settings; pace is shown as the outcome, there is no easy pace target.
  - Threshold reps are judged on **pace in the existing threshold window** (estimate −15/+20 s/km, as `rangeCheck`). HR is shown beside it with the threshold HR as a reference, not as a range.
  - The runner can switch what a step is judged on by tapping it; there is no row of toggles.
- **Near** = at most 5 s/km or 5 bpm outside the target. Results are *in target / near / off*; the summary ("2 av 3 drag i mål") is only green when every rep is in target, and the week view uses the same colour.
- **Amount.** A workout with steps takes its planned amount from them (`9.8 threshold*` in the block text). Writing another amount on that line asks whether to drop the steps; changing the type drops them. Since the block coach the steps are written inline instead, `9.8 tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt)`; the `*` is still read ([fartlek-block-coach](fartlek-block-coach.md)).
- **Lap matching, phase 1.** Auto-laps (distance, time, position) inside one step are merged; only manual laps mark a step change. A step whose lap is too long (a forgotten lap press) is fixed by **splitting the lap at a time that defaults to the planned step duration**, which needs no stream analysis. Fixes change only how steps are judged, never the Garmin data.
- **Curves.** Pace with **elevation shaded behind it** (the usual reason a rep went slow), heart rate, and cadence as three stacked panels on one time axis with **one shared crosshair** and a readout line of every value at that moment. No dual y-axes: each panel stays readable on its own.
- **Logging comes first on the phone** ("how hard was it?" above the step results); on desktop the log and pain summaries sit right under the stats.
- **Dropped from the mocks:** a step bar above the step table, mini step bars in the week chips, and a cadence trend on the activity page (it belongs in Trends).

## Built: activity detail rework (build order 1–2)

- Laps now carry their start offset (same clock as the stream), what ended them (`manual`, `distance`, `time`, `position`, `end`), max HR, cadence in steps per minute (Garmin's per-foot value doubled, fraction included), and elevation gain and loss. The stream has a cadence series.
- The raw FIT file is kept gzipped per activity (`activity_files`), and a sync re-reads a kept file before asking Garmin.
- **No full resync.** Activities have a `detail_version`; a sync refreshes older ones a batch at a time, newest first, after any missing details. A refresh replaces only laps, stream and file in one transaction, and a failed refresh keeps the old detail. Activity rows, threshold flags, logs, pain entries and workout links are never touched. Bumping `DETAIL_VERSION` later re-parses the kept files locally.
- **Backup before migrating**, for every app: `openDb` in server-kit copies an existing database with `VACUUM INTO` when a migration is pending (`app.db.pre-migrate-<time>.bak`, newest 3 kept). New and up-to-date databases are not copied.
- The activity page shows the new curves, cadence under pace, climbing under distance, and cadence and elevation columns in the lap table.

## Built: steps on workouts (build order 3)

- **Syntax** (`shared/steps.ts`): items separated by commas; a repeat is `3x8 min @tröskel / 2 min jogg` with the rest between reps. Amounts in `km`, `mi`, `m`, `min`, `s` (bare numbers in the user's unit); targets `lugnt`/`easy`, `jogg`/`jog`, `@tröskel`/`@threshold`, `@z1`–`@z5`, `@90%`, `@4:40`, `@165`. `:puls`/`:hr` or `:tempo`/`:pace` after a target overrides what it is judged on, so the dialog's "Judged on …" button only rewrites the text and nothing is hidden. Swedish and English both parse; the text is written back in the UI language. A typo gets "did you mean" (`@trsökel` → `tröskel`).
- **Stored as JSON** on the workout (`workouts.steps`), parsed again on the server on save. Only running workouts (not race, cross or rest) take steps; changing the type to one without running drops them.
- **The planned amount comes from the steps**: distance, or minutes when every step is timed. Time steps become distance at their target pace, otherwise at a typical easy pace (median of the last six weeks' easy runs), only for this estimate.
- **Block text** marks such a workout `9.8 threshold*`. The same line with the star changes nothing; another amount warns "the steps go" in the preview and drops them on save.
- **The dialog** shows how the text reads as it is typed: role, target resolved for that date, what it is judged on, rest between reps, and the total. Distance and time fields are locked to "from the steps". Week chips show the first repeat (`3×8 min tröskel`).
- **Demo data** plans its threshold sessions with steps matching the generated runs.
- Announced with the first [what's new](whats-new.md) entry and a "Visa mig" tour into the dialog.

## Built: planned vs actual per step (build order 4)

- **Matching** (`shared/stepmatch.ts`): laps become segments. Auto-laps (distance, time, position) are merged into one step, and a manual lap or the end closes it. An auto-lap followed by a lap whose pace differs by more than 12 % also closes it, because a warm-up that ends exactly on an auto-lap must not swallow the first rep (found in the demo data). Laps fetched before triggers were stored count as manual. Segments pair with the steps in order.
- **A forgotten lap press** shows up as a segment that fits a step plus the next better than the step alone, with fewer segments than steps left. The step is marked "Varv N?", the next one "Inget varv", and the card offers **Dela varv N vid m:ss**. The default is where the plan says the step ends: its time, or where its distance is reached in the stream. Splits are stored per activity (`activity_splits`), can be undone, and never change the Garmin laps. A split part gets its distance by the stream's speed and its HR and cadence from the stream.
- **Judging**: in target, near (≤ 5 s/km or 5 bpm outside) or off. Reps' HR leaves out the first 90 s when the stream has it. Recoveries aren't judged. The summary "N av M drag i mål" is green only when every rep is in target. HR drift (last rep minus first) is mentioned from 3 bpm. Targets resolve with the refs on the workout's date.
- **Where it shows**:
  - **Activity page:** a "Plan mot utfört" card (a table on wider screens, a list on phones) under the stats; the curves shade the reps and draw the pace target band.
  - **Week chips:** the reps result.
- **Which workout:** the one the plan pairs the run with (`sessionForActivity`).
- **Demo data** now runs three reps in every threshold session to match its planned steps.
- A second [what's new](whats-new.md) entry, with a "Visa mig" tour that opens the latest run with steps (card, summary, split box if any, curves).
- Found on the way: "delete my data" missed the kept FIT files from part 1. It now uses one list of training tables, and a test fails if a per-user table is left out.

## The original proposal

### How sessions are written: block text stays, steps are added per workout

The block text keeps today's grammar (one line per week, type + amount) and stays the place to plan volume. Structure is optional and added on the single workout, as a short step text with a live preview of the parsed steps:

```
2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt
```

- Same text-first habit as blocks and the same parser style; a step builder in the UI can come later as another view of the same steps.
- The workout's planned distance/duration is derived from the steps when they exist, so the block's volume and the week's on-track numbers keep working unchanged.
- The block text marks a workout that has steps (e.g. `9 tröskel*`). Re-saving the block text keeps the steps of a paired workout like it already keeps days and notes.
- Passed over: steps inside the block text (lines get unreadable), and a builder first (slower to plan a week).

### Targets: relative by default, pace and/or HR, one of them judged

- A step target is **relative** (`@tröskel`, `@z2`, `@lugnt`, or a % of threshold) and resolved against the threshold and zones valid on the workout's date, so plans follow a new threshold. Absolute targets (`@4:40`, `@165`) are allowed.
- A step can carry **both pace and HR**. One is the **judged** target, the other is shown beside it:
  - Work steps default to **pace**: HR lags 1–2 min, so on an 8 min rep it judges the first quarter wrongly.
  - Easy, long, warm-up and cool-down steps default to **HR**, which is what easy running should be held to.
  - The runner can switch per step.
- HR on a work step is still shown, measured over the step minus its first 90 s, and drift between reps is the interesting number (same idea as durability on long runs).
- This follows the rule from [runplan-training-blocks](runplan-training-blocks.md): HR is a separate signal, never what makes a session fail on its own.

### Matching steps to what was run

- **Phase 1: laps.** The runner presses lap at each step change (or uses auto-lap distances that fit the steps). Laps are paired with steps in order; a step with no lap, or extra laps, is shown as unmatched and can be fixed by hand (merge/split laps onto a step).
- **Phase 2: the stream.** Find step edges in the pace stream when laps don't fit. Built: see [fartlek-stream-steps.md](fartlek-stream-steps.md).

### Judging

- Per step: duration or distance within the same 15 % as weeks, and the judged target inside its **range** (the threshold window Fartlek already shows, a zone's bounds, or ± a margin around an absolute target). Result per step: on target / near / off.
- Per session: a simple summary ("3 of 3 reps on target"), no single score.
- A session is still "done" for the week by today's rules; step results never change week or block status.
- **Later improvement:** tolerance per step kind (tight on reps, none on warm-up), and a session score if the summary turns out too coarse.

### Data changes (activity detail, needs a full resync)

What the session judging and the planned charts need that isn't stored today:

- **Laps:** start offset in the activity, how the lap was triggered (manual / distance / time), max HR, cadence, elevation gain and loss. Today a lap has only distance, time and average HR, so it can't be placed on the stream.
- **Stream:** add **cadence** (Garmin stores steps per minute per foot; double it, add the fractional part). Altitude is already stored. Cadence over time also becomes a Trends chart.
- **Keep the raw FIT file** (gzipped, per activity), so the next change re-parses locally instead of resyncing from Garmin.

**Resync without losing data.** Garmin-derived data (activities, laps, streams, wellness) can be re-fetched. The resync must **update activity rows in place by Garmin activity id, never delete them**, because user data hangs off them: threshold flags, the activity log (notes, sRPE, carbs, stomach), pain entries and manual workout links. Take a database backup before the migration runs. Another user is on the app now, so this is the first change that has to be safe for someone else's data.

## Open

- **Cadence target.** Don't flag below 180: that figure comes from watching elite runners at race pace, and good cadence is individual and rises with speed. Track cadence at a given pace over time instead (like easy pace at the same HR). A 180 reference line is possible if the user wants it.
- Whether threshold proposals should use the judged reps of structured threshold sessions instead of `intervalLaps`.
- **Cadence trend in Trends** (cadence at a given pace over time) waits until most streams have been refreshed with cadence.
- **Block text in the UI language** (see Language above).
- **Logging first on the phone** (from the mock review) isn't built: the log card is still below the curves.
- **Phase 1 gaps found on real runs** ([fartlek-stream-steps](fartlek-stream-steps.md)): a watch workout's laps are `time` triggers and count as auto-laps, and a few-second `session_end` lap becomes its own segment.
- **Disk.** Kept FIT files make the database grow by roughly the size of the zipped downloads; worth a look once a season of files is stored.

## Build order

1. ✓ Activity detail rework: lap offsets and fields, cadence, raw FIT kept; refreshed in place, backup before migrating.
2. ✓ Elevation and cadence on the activity page (curves with a shared crosshair); the cadence trend is postponed (see Open).
3. ✓ Step parser and steps on workouts (with preview), derived planned amount; announced with a what's new entry.
4. ✓ Lap-to-step matching and per-step judging on the activity page and the workout.
5. Session library and block templates: mocked and put off, see [fartlek-session-library.md](fartlek-session-library.md).
6. ✓ Stream-based step detection: offered when the laps don't fit, stored as a full set of lap splits; see [fartlek-stream-steps.md](fartlek-stream-steps.md).
