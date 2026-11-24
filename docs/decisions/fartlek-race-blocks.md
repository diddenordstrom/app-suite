---
title: Fartlek plans the weeks up to an A or B race backwards (peak builds, then a two-week taper)
summary: Spec for race-mode block planning: from the race date, two taper weeks, up to three build weeks before them, a lighter week ahead of those, and the base engine's guards kept; replaces the "race within 16 weeks refuses" rule
type: decision
status: accepted
updated: 2026-11-24
---

# Fartlek plans the weeks up to an A or B race backwards

Agreed in a chat with the user on 2026-11-16, as a spec for a build session; built the same day (see "Built" below). It fills the gap named as open in [goal-driven blocks](fartlek-block-goals.md) ("race-specific blocks … are not generated") and in [block progression](fartlek-block-progression.md) ("a pre-race phase"). Distance-specific training (10k versus marathon: session mix, long-run share) is **out of scope** on purpose and waits until the base engine has run on real histories.

## Why

Today block suggestion (the "Skapa block" dialog, see [Skapa block](fartlek-skapa-block.md), whose step 1 already reads the race window and the suggest path still refuses) gives nothing in the weeks that matter most:

- `raceNear` ([`routes/blockplan.ts`](../../apps/fartlek/src/server/routes/blockplan.ts), used by the suggest route and the save route) returns a 409 `conflict: "race"` when an A or B race is within `BLOCK.raceWindowWeeks` (16) of the block's start, or a race session lies inside the block. The dialog ([`suggestblock.tsx`](../../apps/fartlek/src/client/suggestblock.tsx)) says to plan those weeks in the block editor's race mode. `raceJustRun` refuses for `BLOCK.afterRaceDays` (14) after a race.
- The block coach's race mode ([`shared/coach.ts`](../../apps/fartlek/src/shared/coach.ts), `COACH.race`, `COACH.taper`) only **judges** a plan the runner built by hand: form on race day should be between `FORM.fresh` and +20, and when it is "tired" it offers tips (`raceCut` 70 % the week before, `raceReps` 50 %, `raceEasy` 60 %). It generates nothing.
- `raceHints` / `TAPER_WEEKS` in [`shared/blocks.ts`](../../apps/fartlek/src/shared/blocks.ts) give an advisory taper (two weeks, −40–60 %, Bosquet 2007) and a volume / longest-run band for half and marathon only (Fokkema 2020).

So the runner gets a base engine up to 16 weeks before an A race and then plans the toppning by hand.

## Decided

- **Plan backwards from the race.** For an A or B race, the weeks from the start (a week that hasn't started, as now) to the race week are planned from the end:
  1. **Race week**: taper week 2 (the race is in it).
  2. **Week before**: taper week 1.
  3. **Before the taper**: up to **three** build weeks, the last two being the **peak weeks** (3–4 weeks before the race, where the usual plans put the biggest week and the last long run).
  4. **A lighter week** ahead of the peak builds when the builds before them ran three weeks or more in a row (the existing 3:1 rule, same 70 % share), otherwise none.
  5. Weeks earlier than that are ordinary base weeks, built as today.
- **Weeks left decide the shape; no special cases.** The last two weeks are always taper and everything before is build with a lighter week where the rule asks for one. With 4 weeks left it reads 2 build + 2 taper (2:2), with 3 weeks 1:2, with 2 weeks 0:2. An 8-week run reads 3:1 followed by 2:2.
- **No separate "peak mode" and no extra push.** The ramp (`TUNE.ramp`, 1.0 → 1.1 of the tolerated km) already makes the last build weeks the biggest the runner has done, and every injury guard stays untouched: the spike rule (10 % over the longest run of 30 days), weekly growth (+10 %), the km ramp limits, the form floor and the threshold ladder. The peak is a matter of *where* the biggest weeks land, not of lifting the guards.
- **A taper is not a lighter week.** A lighter week cuts to 70 % of volume and long run. A taper cuts further (first week about 70 % of the peak, race week about 50 %, the defaults already in `COACH.taper`), keeps frequency, and keeps a few short fast reps. The taper replaces the lighter week at the end of the plan; the two are never stacked.
- **Taper depth is checked by the simulation, not fixed.** `evaluateBlock` already simulates the whole plan as a chain of weeks. The engine picks the taper depth inside the Bosquet range (total −40–60 %) so that form on race day lands in `COACH.race` (`FORM.fresh` to +20). A fixed 70 / 50 / 60 is the fallback, not the rule.
- **Taper length stays two weeks for every distance for now.** `TAPER_WEEKS` is the single value; a distance-dependent taper comes with the distance work.
- **After the race:** keep the existing 14-day refusal (`raceJustRun`), then base blocks again. A recovery block is not generated yet. *Superseded on 2026-11-24 by [post-race recovery](fartlek-post-race-recovery.md): the refusal goes and the next block starts with recovery weeks.*

## Settled after the spec (2026-11-16)

- **Blocks you can follow up, not one long plan.** The runner wants to see and finish one block at a time. Counting back from the race in 4-week blocks: the **last block is the form peak, 2:2** (two peak builds, two taper weeks); the blocks before it are **builds, 3:1**; what is left at the front becomes a shorter block that puts the runner in phase: 3 weeks → 2:1, 2 → 1:1, 1 → one ordinary base week as its own block (a 5-week 4:1 is too long to build in). 8 weeks = 3:1 + 2:2; 10 = 1:1 + 3:1 + 2:2; 11 = 2:1 + 3:1 + 2:2; 15 = 2:1 + 3:1 + 3:1 + 2:2. Beyond the 16-week race window, ordinary base blocks as now.
- **What "Skapa block" offers.** Within 8 weeks it plans the build block and the form-peak block together (one call, so peak and taper fit) and saves them as **two blocks**, both shown in the block view. 9–16 weeks out it creates only the first block and says what follows ("Loppet om 11 veckor: det här blocket (3 veckor) får dig i fas, sen uppbyggnad 4 veckor och formtopp 4 veckor"). Within 4 weeks it offers only the form-peak block, shaped by the weeks left: 4 → 2:2, 3 → 1:2, 2 → 0:2, 1 → the race week alone.
- **Step 1 with a race in range** replaces the rhythm cards (1:1/2:1/3:1) with the shape the race decides, as in the "Lopp om 6 veckor" mock.
- **The editor's week type gets a third value, "Nedtrappning"**, next to Uppbyggnad and Lättare vecka, so a taper week can't be switched into a lighter week by mistake. A lighter week lets the body absorb the training (form back up from deep negative toward about −5); the taper is the one time form should go positive (race day between `FORM.fresh` and +20).
- **The race day, not the weekday, places the race week's sessions**: the last short sharpening session 3–4 days before, rest or a short easy run the day before, only easy after it. The same rule fits a Saturday, a Sunday or a weekday race.
- **A B race gets a mini-taper, no taper week before it**: the race week at about 70 %, Monday–Wednesday shorter than usual with one short sharpening session, easy until the race. An A race gets the full two-week taper.
- **"Ändra block"'s race limit goes**: today it edits a race's weeks by hand and hides "Räkna om resten"; with race planning in place, re-planning those weeks is allowed.
- **Recovery after the race** waits; when built, its length follows the distance (rule of thumb: about a week easy after 5–10 km, 1–2 after a half, 2–4 after a marathon). Decided on 2026-11-24 in [post-race recovery](fartlek-post-race-recovery.md): recovery weeks at the start of the next block after an A or B race of 10 km+, gated by days since the race.

## Built (2026-11-16)

- **Engine** ([`shared/blockplan.ts`](../../apps/fartlek/src/shared/blockplan.ts)): every week has a role (`WeekRole`: build, lighter, taper, race; `BlockSeed.roles` overrides the lighter-week rule). `raceChunks` counts the 4-week blocks back from an A race, `raceRoles` gives each week's role (a B race: the usual rhythm with a lighter race week). Taper and race weeks are a share of the peak build week; the depth is searched shallow to deep (`TAPER_DEPTHS`) until race-day form (`BlockEval.race`, simulated day by day to the day before the race) lands in `COACH.race`. **Changed from the spec:** when no depth lands inside, the depth that came closest is used, not the fixed `TUNE.taper` shares (a runner back from a break reached +3 with it against +0.8 with the fixed shares); the fixed shares remain for when race-day form can't be simulated. The race week's sessions are placed around the race day (`aroundRace`): nothing on the day or the day before, a short sharpening session (4 × 3 min) three or more days before, only short easy runs after. New knobs `TUNE.taper` (first, race, bRace) in "Utvecklarinställningar".
- **Routes** ([`routes/blockplan.ts`](../../apps/fartlek/src/server/routes/blockplan.ts)): `raceNear` no longer refuses; `racePlanFor` picks the weeks and roles (within 8 weeks both blocks, further out the first block). The save takes `blocks` (one block per part, kinds base/build/specific) and `roles` (taper weeks get a `taper` note); undo removes every block it wrote. Races are never in what a suggestion or a re-plan replaces. The re-plan plans toward a race in the weeks left (`replanRace`) instead of refusing.
- **Dialog**: step 1 shows the blocks up to the race in place of the rhythm cards; the editor labels each block over its first week, offers "Nedtrappning" as a week type and shows form on race day; the block length is fixed by the race.
- **Scenarios**: race in 5, 8 and 14 weeks, after a break, and at peak; all land the A-race plan's race-day form in the window except the runner back from a break (+3, the closest).

## Where it goes

- **One entry, no second engine.** Race planning is `planRange` ([`shared/planrange.ts`](../../apps/fartlek/src/shared/planrange.ts)) with a race as input, planned by the block engine in [`shared/blockplan.ts`](../../apps/fartlek/src/shared/blockplan.ts). "Skapa block" (suggest), "Räkna om resten" and the pause call all go through it, so a race in the range changes what they all do. See [adaptive engine](fartlek-adaptive-engine.md) ("One entry to the engine").
- **Remove the refusal, not the race check.** `raceNear` stops refusing; a race in the range now selects race planning. `raceInOpenWeeks` and the dialog's `rp.race` message ("plan them in the block editor's race mode") go the same way. The block editor's race mode stays as the manual route.
- **Judging stays in the coach.** The block coach keeps its race mode as the judge of the result, and its tips still apply when the runner edits the plan. The planner and the coach must agree on the same race-day form window (one constant, `COACH.race`).
- **Tuning.** New knobs go in [`shared/tuning.ts`](../../apps/fartlek/src/shared/tuning.ts) (`TUNE` with `TUNE_RANGE`, so they appear in "Utvecklarinställningar"): number of peak build weeks (default 2, up to 3), the taper shares. **Not in `TUNE`:** the form window on race day, the taper length range and every injury guard, because a bad value can hurt the runner (same rule as in [block progression](fartlek-block-progression.md)).
- **Strings** through `t()` in `en` and `sv`; shared logic returns message keys and params. Reuse `packages/i18n` keys before adding new ones. A block that ends in a taper should say so in the dialog ("Nedtrappning de sista 2 veckorna") and show what-if form on race day, like the re-plan dialog does.

## Build order

1. **Pure planner**: given a seed, the weeks to the race and the race date, return the week roles (base / build / lighter / taper / race week) and km targets. Unit tests: 2, 3, 4, 8, 12 and 16 weeks to the race; no lighter week stacked on a taper; the peak weeks are the biggest; every guard holds; race on a Monday and on a Sunday.
2. **Taper depth by simulation** against the `COACH.race` window, with tests that the fallback holds when no depth lands inside it.
3. **Session content**: taper weeks keep frequency and a few short reps (the `COACH.taper.reps` idea, now generated instead of suggested); the long run steps down.
4. **Wire into `planRange`** and the three routes; drop `raceNear`'s refusal and the 409 handling in the dialogs; keep `raceJustRun`.
5. **Scenarios**: add race cases to `npm run scenarios -w apps/fartlek` (race in 5, 8 and 14 weeks; a runner just back from a break; a runner already at peak). Compare against the block coach's race-mode verdict on each.
6. **Docs**: extend this page with what was built, move the closed items out of the "Open" lists of the two pages above, add a log entry, run `npm run docs:index`.

## Passed over

- A separate "peak mode" that lifts the intensity and volume limits: the ramp already puts the biggest weeks last, and the point of the guards is that they are not relaxed.
- Fixed 4-week blocks ending at the race: they only fit when the race is a multiple of four weeks away; planning from the race backwards gives the same shape (3:1 then 2:2 for eight weeks) without the constraint. See Open.
- A fixed 70 / 50 / 60 taper as the plan: kept as a fallback only, since the simulation can aim at the form window.
- Distance-specific peak and taper now: no 10k build, no marathon long-run share. Waits for the base engine.

## Open

- How the base blocks more than 16 weeks out should end so the race plan starts on a block boundary (the in-phase block above handles it from 16 weeks in).
- Distance-specific race blocks are decided in [race-specific phase](fartlek-race-specific-phase.md); recovery after the race in [post-race recovery](fartlek-post-race-recovery.md) (decided, not built).
