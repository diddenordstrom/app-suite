---
title: Fartlek asks which days gym and cross-training go on, and plans runs around them
summary: Skapa block has a step between the rhythm and the simulation that asks for gym days and cross-training days with minutes; the engine puts those sessions there, plans no run on them, keeps the quality session off the day after gym when another day will do, and never offers them as extra run days
type: decision
status: accepted
updated: 2026-11-25
---

# Fartlek asks which days gym and cross-training go on

Raised by the user on 2026-11-18, after [gym became its own session type](fartlek-gym-sessions.md); built 2026-11-25.

## The wizard

"Skapa block" with "Låt coachen föreslå" now has three steps:

1. **Utgångsläge**: where the runner stands and the rhythm (1:1, 2:1, 3:1), as before ([fartlek-skapa-block.md](fartlek-skapa-block.md)).
2. **Gym och alternativträning**: "Do you go to the gym? At least one strength session a week is recommended…, which days?" as day chips ("Ingen" is a valid answer), then which days of cross-training (swimming, cycling) and minutes per day. The long-run day can't be picked, a day is either gym or cross-training, and the run days left are shown. A gym day right before the long run gets a note, not a block.
3. **Planera veckorna**: the simulation (with a line for the gym and cross-training days), the run-day question if needed, then the editor with gym and cross-training as sessions in every week.

"Bygg själv" skips step 2: the weeks start empty.

## Rules

- **Stored in the settings** (`gymDays`, `crossDays` as weekday + minutes), not per block. The question is asked every time a block is created and prefilled with the last answer, which covers a winter with two gym days and a race season with one without a field per block. "Räkna om resten" and "Föreslå veckan" use the same days. *Passed over:* per-block columns, as the first plan suggested: more data and migrations for something the question already covers.
- **No run on those days.** The engine's run days are the settings' run days less the gym and cross-training days (all of them if that would leave none). The long-run day is never taken.
- **Placed as sessions.** Gym as a 60-minute `strength` session, cross-training as a `cross` session of the minutes given, in every week (lighter weeks too). Their load comes from the sessions, so the other-sports habit (`crossMin`) is 0 while any days are set and isn't counted twice. Around a race: nothing on race day or the day before, and neither gym nor cross-training later in the race week; gym waits for the rest days after a long race like running does.
- **Quality session not the day after gym, as a soft rule.** A day after gym counts as 1.5 days closer to the hard days when the threshold or race-phase session is placed, so it goes there only when every other day is worse. With only one free day it still goes there: the rule never makes a week unsolvable.
- **Never offered as an extra run day.** "Vi rekommenderar en löpdag till" leaves gym and cross-training days out of the days it offers.
- Planned gym sessions are now part of the weeks the editor and re-plan read (`workoutWeeks`), so a re-plan writes them back instead of dropping them.

## Reference week

Used as a test (`blockplan.test.ts`): gym Monday, swimming Thursday, a bike ride Saturday; runs Tuesday, Wednesday, Friday and Sunday. Every week gets gym on Monday and cross-training on Thursday and Saturday with no run, and the one threshold session lands on Wednesday or Friday, never Tuesday.

## Decisions on the way

- Settled 2026-11-18 with the user: **the planner doesn't suggest what to do in the gym**, only the recommendation and the days. The [gym module](fartlek-gym-module.md) suggests a template on the gym page.

## Open questions

- Whether gym should also keep the long run off the day after it. Today the long-run day is fixed by the settings, so the dialog only warns.
