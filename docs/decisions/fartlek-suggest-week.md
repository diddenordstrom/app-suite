---
title: Fartlek suggests a week the runner then edits freely
summary: "Föreslå veckan" builds one week that hasn't started from the coach's limits (form band, km ramp, one long run, at least one threshold session), shows what it tried, and hands over an editable week with live numbers; nothing is locked, the long run day is a setting
type: decision
status: accepted
updated: 2026-11-13
---

# Fartlek suggests a week the runner then edits freely

Asked for by the user (Nov 2026), to rival apps like Runna: "suggest a week that keeps fitness in the range and km in the range, with one long run and at least one intensity session such as threshold. If intensity is too low, go to two threshold sessions." Mocked first on the "Fartlek – föreslå nästa vecka" canvas, which went through three rounds: editable sessions and live charts instead of a "why" text, drag between days, and less text.

## Decided

- **A starting point, never a lock.** "The app should give the user every tool and recommend, but never lock anything in. Planning your own blocks is fun." Every session can change type, length and day; sessions can be removed and added; a 100 km long run is allowed. The numbers turn yellow or red, but "Använd" always works.
- **Where:** a "Föreslå veckan" chip on every week in the Plan week/month view that hasn't started, except weeks with a race (on the race list or as a session). At first it was only on empty weeks, but the user found the button never showed, because their block already filled the coming weeks (2026-11-12). The suggestion opens in a dialog over the plan. When the week already has planned sessions, it says it replaces them ("Ersätter de 4 passen…"). "Använd" deletes those and writes the new sessions on the days shown, then returns to the plan with "Vecka N är inlagd · Ångra" for ten seconds. Ångra removes the new sessions and puts the old ones back with their ids, notes and steps. Only the sessions the runner was shown are replaced: if the week changed meanwhile, the write is refused (409).
- **The engine** (superseded 2026-11-13 by [key sessions first](fartlek-key-sessions-first.md): the long run on a 30-day ladder, the threshold ladder, zone 2 fills, one dial; the order below is history) (`apps/fartlek/src/shared/nextweek.ts`) uses the block coach's limits ([fartlek-block-coach.md](fartlek-block-coach.md)): the form band (−10 to −25, `COACH.goal`/`FORM.heavy`, over below `COACH.floor`) and the km ramp (`COACH.rampCap` 1.3, flagged over `rampRisk` 1.4). It tries a fixed order and stops at the first week in the band:
  1. More volume: the week at its cap with one threshold session (3×8 min).
  2. Longer reps (+2 min, the coach's `reps` tip).
  3. A second threshold session (3×8 and 4×6), only with four run days and km left for at least one easy run.
  4. Other sports (45 min) as the last resort, "always running first".
  When nothing reaches the band, the closest variant is kept and the dialog says it is as close as one week gets. When the base week is already too hard, lighter weeks (−10 %, −20 %), then a week without threshold. A km target or backoff mark on the week, or no run history at all, skips the search.
- **The cap** is +10 % on the week before or on the mean of the 3 weeks before, whichever is higher, and never over the ramp cap. Using the mean too means one short week (illness, travel, a half-done current week) doesn't shrink the next. The volume number shows which base it was measured on.
- **Judged on form at the end of the week**, the day after its last session. The block coach judges on the lowest daily form inside the week, which leaves out a Sunday long run.
- **Placement:** the long run on the **long-run day** (new setting, default Sunday). When that isn't a run day, it goes on the last run day. Threshold sessions go on the run days furthest from the long run and from each other, the rest are easy runs. Easy runs are rounded down to halves so the week stays under its cap (now: the last easy run takes what is left, so the week adds up, see [key sessions first](fartlek-key-sessions-first.md)). Other sports go on a free day. The first two easy runs end with strides, never the long run ([session builder](fartlek-session-builder.md), 2026-11-13).
- **Run days stay "Vanliga löpdagar"**, not Runna's "days I can't run". The setting already existed, quick-add uses it, and the number of days chosen is the number of sessions, so one setting is enough. The flip would have needed a second "sessions per week" setting and a migration. The long-run day was added beside it, a choice among the run days ("many apps let you flag it"). Quick-add from the block text now puts the long run there too (`placeSessions`).
- **The simulation is honest.** "Simulerar bästa möjliga vecka… Testar olika pass… Klart!" lists the variants the engine actually tried, with their form and verdict, about 0.65 s a line. It is shown at once with reduced motion. "Så valde Fartlek" keeps the same list after the animation.
- **Live numbers instead of a "why" text:** form (with the band), volume (+% on its base), km ramp, and long run share, with badges only when something is off. Warnings for two hard days in a row or no threshold session. Three charts, one thing each (fitness and fatigue, form with the band, weekly volume with the +10 % mark). The client re-runs `evaluate` from the seed the server sent, so edits need no round trip.
- **Drag between days:** with the mouse, the whole card; with touch, the grip on the card, so scrolling still works. It is built on pointer events, without a new dependency. Dropping on a day that has a session swaps the two. Hidden ‹ › buttons do the same for the keyboard.

## Found while building

With the real load model, one week capped at +10 % rarely moves form from around 0 to −10. Form falls over several weeks of build, not one. From a balanced start the engine often ends at "as close as it gets" with two threshold sessions plus other sports. That follows from the limits the user set (+10 % and the form band), not from a bug, and the mock's −12 was an invented number.

## Open

- A "Föreslå veckan" entry in the block editor, writing the week's line into the block text. Block text has no days, so the dragged days would need the sessions saved directly, as here.
- Whether to suggest around sessions the runner wants to keep (today a suggestion replaces the whole week).
- Whether the block coach should also judge on end-of-week form (see above).
- Whether a week that can't reach the band should say so before the user presses the button.
- Judging one week at a time is the next thing to change: see [fartlek-block-goals.md](fartlek-block-goals.md) (2026-11-13).
