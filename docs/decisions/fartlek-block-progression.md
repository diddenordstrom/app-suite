---
title: Fartlek blocks rise through the block and are scaled by bisection, and extra run days are offered only when they change the plan
summary: Build weeks follow a ramp of the proven load (100 % → 105 % → 110 %) before a lighter week; a too-hard block is scaled down by bisection so it keeps rising; the long run is a share of the week that falls with volume; easy runs are at most half the long run; the tweakable values live in one table and the injury guards stay outside it; "add a run day" is asked only when a trial plan shows a free day helps
type: decision
status: accepted
updated: 2026-11-24
---

# Fartlek blocks rise through the block and are scaled by bisection, and extra run days are offered only when they change the plan

Settled with the user on 2026-11-14 after a real block came out flat (31.5 km three weeks running), with the "add a run day" question repeating until all seven days were run days while the plan used four. It builds on [goal-driven blocks](fartlek-block-goals.md) and amends [easy runs sized from the week](fartlek-run-days.md). Code: `volumes`, `fitScale`, `blockDaysAdvice` in [`shared/blockplan.ts`](../../apps/fartlek/src/shared/blockplan.ts); `longFor`, `daysAdvice` in [`shared/nextweek.ts`](../../apps/fartlek/src/shared/nextweek.ts). Every number is a constant in `BLOCK` / `NEXT`, meant to be tuned.

## What went wrong

- **Flat blocks.** Every week's cap was clamped by the tolerated peak (the runner's biggest recent week). A too-hard block was then scaled by 0.9 or 0.8 *of every cap*, so the clamp made all weeks equal: 35 × 0.9 = 31.5 three times, and a lighter week of 22 km with a 13 km long run.
- **A question that could not be answered.** The "fit" signal fired on the lighter week's 2.4 km shortfall: the long run and threshold left less than the 3 km minimum easy run. Another run day only splits 2.4 km into smaller pieces, so the shortfall never changed and the dialog asked until no day was left.

## Decided

- **A ramp through the block** (`TUNE.ramp`): build weeks aim at the tolerated km × 1.0, 1.05, 1.1 in a straight line from the first to the last build week (a lone build week sits in the middle), each still held to its safe cap (+10 % on the growth base, the km ramp). Start at what the body has handled (in a run of blocks, the last block's top week), climb 10 % through the block, and the lighter week (70 %) absorbs it. This is the usual loading-then-deload pattern (3 : 1), not a new theory. The first defaults were 0.92 → 1.08; on 2026-11-14 a simulated run of seven blocks from 32 km gained only ~8 % a block (52.5 km by June) because each block restarted 8 % under the last top week, so the user set 1.0 → 1.1 (about 50 km by April, 61 by June). The first week is still capped at the week button's suggestion (see below).
- **A too-hard block is fitted week by week** (`fitWeeks`): when the full ramp is too hard (deepest form under the floor), each build week gets the largest km, up to its ramp aim, that is not too hard given the weeks planned before it (bisection per week, caps recomputed from the fitted weeks). A tired first week costs that week, not the whole block, so the block still rises. A first version scaled the whole block by one factor, found by bisection, and for a runner just off a 32 km week it collapsed to 15 km weeks (key sessions only), because the first week could never become "ok". When a week is too hard at any km it takes the shallower of the aimed km and a 25 % cut, never a collapse.
- **The form floor is measured from where the runner starts** (`floorFor`): `COACH.floor` (−30 %), or for a runner who starts near or under it, `BLOCK.fit.slack` (5) points deeper than the start. A floor from zero is a cliff: a runner at −29.5 % whose block dips to −32.8 % was cut by a third for 3 points of form that the start decided.
- **The long run is a share of the week that falls as the week grows** (`longShareAt`): `0.30 + 0.20 × e^(−(km − 20) / 40)`, at most 0.6 (30 km a week → 46 %, 50 → 39 %, 70 → 36 %, 90 → 33 %). A planned block's long run keeps its ladder but stops stepping when it would pass that share, unless the runner has already run that far; it then holds at the longest run and never shrinks. A lighter week's long run is held to the share, so it shrinks with the week. The ladder steps by 8 % of the longest run, at least 1 km, and never past the spike rule (24 km → +1.9 km, not +1). Only block planning applies the share; the week button keeps its ladder.
- **Easy runs are at most half the long run** (`TUNE.easy.ofLong`): what the long run and threshold leave is split into as few runs as that takes (`ceil(rest / (0.5 × long))`), on the first run days, never under 3 km. A long run of 15 with 14 km left gives two runs of 7; 20 km left gives three. This replaces the 12 %-of-the-week sizing of [fartlek-run-days](fartlek-run-days.md): the number of runs now follows from the long run, so the number of days it calls for does too.
- **One table for what can be tweaked** ([`shared/tuning.ts`](../../apps/fartlek/src/shared/tuning.ts), `TUNE` with `TUNE_RANGE`; a test keeps every default in its range, and a settings panel can read the ranges later). In it: the ramp, the lighter-week shares (volume and long run), the long-run share curve and step, the easy-run share of the long run, the run-days-by-volume table and the shortfall that asks for a day. **Not in it, because a bad value can hurt the runner:** the spike rule (10 % over the longest run in 30 days), weekly growth (+10 %) and the km-ramp limits, re-entry growth and tolerance fade, the form bands that call a block too hard or too easy, the threshold share and ladder, the long-run ceiling in km and minutes, and the number of build weeks before a lighter week. Those stay constants in `NEXT`, `COACH` and `BLOCK`.
- **"Add a run day" is a trial** (`daysAdvice` with a `trial`): the signals (peak km, shortfall) only decide whether to look. The same weeks are then planned again with each free day added; a day is offered only if it adds run km (≥ `NEXT.shortKm`) or sessions in the peak week. A day the engine would leave empty is never offered, and with none left the question is not asked.

## Passed over

- Shrinking the long run to fit the share. It would cut a runner's long run below what they have run, which hurts marathon preparation.
- A flat 40 % cap: too tight for a low-volume week and too loose for a big one, which is why the share falls with the week.
- A day-count table as the only signal. It stays as a trigger, but a question needs a trial that confirms it.

## Developer settings

Built on 2026-11-14. An admin can override every number in `TUNE` per user, in "Utvecklarinställningar" at the bottom of Settings (`client/devsettings.tsx`).

- **Who sees it:** dev mode (always admin) or a member of the Pocket ID group `admin` (`ADMIN_GROUP` to change it); never a demo visitor. The server enforces it (`requireAdmin`, 403 otherwise); the page only hides the card.
- **How groups arrive:** server-kit asks for the `groups` scope when the provider lists it in discovery, reads the group names from the `groups` claim (names, or objects with a name) in the ID token or, failing that, from userinfo, and keeps it in a cookie signed together with the user's `sub`. Groups are a snapshot from sign-in, so a change in Pocket ID shows after the next sign-in. `/api/auth/me` returns `isAdmin`. The claim name is from Pocket ID's documented `groups` scope; a custom claim is not read.
- **Stored as** JSON overrides in `engine_tuning` (one row per user), validated by `parseTuning` (known numbers inside `TUNE_RANGE`, the ramp must rise, the run-day limits must grow). A row left at its default is not stored, so a later change of a default reaches it. Wiping training data keeps it.
- **In force** while a plan is made: the routes wrap the week and block suggestions in `repo.tuned`, which sets the active values (`withTuning`) for that synchronous call. Plans already saved never change. The client only evaluates edits, which read none of these values.
- **The days table became four numbers** (`daysFromKm.d4–d7`) so it can be edited as inputs.

- **The threshold stays off the day after the long run** (`build` in `nextweek.ts`): days are counted apart around the week, since the long run comes back on the same day every week. A Sunday long run used to put the threshold on Monday (six days away inside the week, one day after last week's long run), and every planned week warned "two hard days in a row". The free days offered for an extra run day are counted the same way.
- **The first week is never bigger than "Föreslå veckan"** (`firstWeekMax`): both plan the same week, and the week button backs off after a jump (25.5 km after 10.9 → 20.2 → 32.3, where the block started at 29.5). The block then rises from there.

## Open

- ~~A pre-race phase by distance.~~ Decided 2026-11-24 in [race-specific phase](fartlek-race-specific-phase.md): 8 weeks for both marathon and half, long-run ceiling unchanged.
- A setting for days the runner can't run (gym, swimming), so free days offered are real ones.
- The share curve (floor 30 %, extra 20 %, scale 40 km) and the 8 % step are first guesses from rules of thumb (Daniels: 25 % or 150 min), not studies; tune them on real histories (`npm run scenarios -w apps/fartlek`).
