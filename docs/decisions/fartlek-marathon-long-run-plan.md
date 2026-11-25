---
title: Fartlek marathon plan for a low-volume runner: long runs over 30 km need their own track
summary: Why a marathon plan for a runner with a 35 km proven peak week never gets a long run past about 21 km, and what was decided: five long runs (three 30+ km, two 26–30 km) on a long-run track planned back from the race, 30 km as the target and 32 only when the cap allows, 55–60 km weeks with up to 50 % long run, a hard cap at 1.75 × proven peak that follows the proven peak as it grows
type: decision
status: accepted
updated: 2026-11-25
---

# Fartlek marathon plan for a low-volume runner: long runs over 30 km need their own track

Raised on 2026-11-25 when a runner with a proven peak week of about 35 km, a marathon far out and a half marathon on the way was shown a plan whose longest run stopped at about 21 km while the plan itself warned that under 25 km tends to give a slower finish. The points below were decided the same day and built the same day (see "How it was built"). It builds on [long-run ceiling](fartlek-long-run-ceiling.md) and the [race plan skeleton](fartlek-race-plan-skeleton.md), and the answers should land in those (or supersede them).

## The problem

For a marathon the plan should put a handful of 26–32 km runs in the legs (muscle endurance, fuelling, time on feet), at least two or three of them 30 km or more. A runner starting from 35 km a week has months to build, yet the plan peaks the long run at the half-marathon distance.

## Why it happens today

- **The long run is derived from the week, not the other way round.** A marathon plan's build and specific weeks give the long run at most 40 % of the week (`RACE_PLAN.marathonLongShare`). The suggested cap on the peak week is 1.5 × the proven peak, so about 50 km, and the build weeks stay at or under it: 40 % of 50–55 km is 20–22 km.
- The decision behind that assumed a runner on 70–80 km, where "30 km comes at about 75 km a week". For a 35–55 km runner it never gets there.
- The ladder (+1 km or +8 % over the longest run of the last 30 days, no more than 10 % over it) is not what binds. It would climb; the share caps it first.
- Plain long runs stop at 30 km or 3 hours, key marathon long runs at 32 km (`NEXT.longCeiling`). At a slow easy pace the 3-hour limit stops the run before 30 km.
- The skeleton only covers a marathon up to 30 weeks out; further out there is no road, and the long run has no schedule at all.

## What outside advice says (for and against)

- A marathon wants about 5 long runs of 26–32 km, spread over the specific phase, with a lighter week after each of the biggest; the long run is typically 25–35 % of the week, rarely over 40 %.
- Low-volume marathon plans exist where the long run is 50 % or more of the week (30–32 km in a 55–60 km week), at the price of short, easy days around it. The two views pull apart: this is the central question below.
- Cycling and swimming add aerobic load without impact but do not replace the impact tolerance a 30 km run gives.

## Decided

Settled with the user on 2026-11-25; built the same day.

1. **Five long runs of 26 km or more before the taper, three of them 30 km or more**, without taking extra key sessions (revised later the same day; first it was three 30+ runs only):
   - one plain easy run of about 26–28 km at the end of the base / start of the build, about 12–13 weeks out;
   - one plain easy 30 km run about 10 weeks out (end of the build, no key session competes);
   - the two existing race-phase long blueprints at 6 and 4 weeks out (fast finish; [PHASE_SCHEDULE](../../apps/fartlek/src/shared/blueprints.ts)) reach 30 km, with the lighter week between;
   - the MP long run at 3 weeks out stays about 26–28 km so the form peak is not spent.

   That matches outside advice of about five runs of 26–32 km.
2. **The long run gets its own track, planned backwards from the race.** The three 30+ runs are fixed on their weeks, the 8 % ladder rungs before them are counted back so they land on 30 km in time, and the week is sized to carry the run, not the run sized from a week.
3. **Weeks with a 30+ run may be about 55–60 km, and the long run may take up to 50 % of such a week**, the other days short and easy. Other weeks keep the share of [long-run ceiling](fartlek-long-run-ceiling.md). **30 km is the target; 32 km only when the week allows it at 50 %** (a 64 km week). With a 60 km cap the 30+ runs land on 30 km; the share is not raised past 50 % to reach 32.
4. **The peak cap stays hard**, to limit injury risk, but for a marathon it is suggested at 1.75 × the proven peak week (rounded to 5 km: 35 gives about 60 km); a half keeps 1.5 ×. **The cap follows the proven peak:** when the runner completes a bigger week during the plan, the suggestion is computed again from it, so a cap set from 35 km half a year earlier does not stay the ceiling. A cap the runner typed in stays as typed.
5. **One ceiling of 32 km** (the most a run may reach, not the target) for plain and key long runs alike, and 3.5 hours instead of 3 for a marathon (the time limit would otherwise stop a slower easy pace before 30 km).
6. **Growth stays as it is:** long run +8 % (at least 1 km) and never over 10 % above the longest run of 30 days; weeks +10 % careful, +30 % back towards a proven level, a lighter week every fourth.
7. **Extra weeks go to the base.** The specific phase (8 weeks) and the taper (2–3) stay fixed; a longer road gets a longer base where volume grows slowly and the long run reaches about 18–20 km.
8. **A half marathon on the way is a B race and a hard session**, counts as a 21 km step on the ladder, and no 30+ run is placed within two weeks of it.
9. **Taper unchanged:** two weeks, last long run (MP) three weeks out.

## Passed over (so far)

- **Just raising `marathonLongShare`.** It fixes the symptom but makes every week lean on one run and gives no schedule of how many long runs the plan reaches.
- **Doubling the peak cap.** Volume alone does not guarantee the long runs; they need a target of their own.
- **Raising the share to about 55 % to reach 32 km.** Two extra km are not worth leaning a week that hard on one run; 32 comes only with a bigger week.
- **A cap fixed at the proven peak from the day the plan was made.** Too strict months later, once bigger weeks are proven.

## Where it would be built

`NEXT.longCeiling` and `longRun`/`longFor` in `apps/fartlek/src/shared/nextweek.ts`; `RACE_PLAN` (`marathonLongShare`, `capSuggest`, `longPeak`) and the skeleton in `apps/fartlek/src/shared/raceplan.ts`; the phase schedule and blueprints in `racephase.ts` and `blueprints.ts`; the preview in `apps/fartlek/src/client/suggestblock.tsx`.

## How it was built

The track lives in `RACE_PLAN.track` and `longTrack()` in [raceplan.ts](../../apps/fartlek/src/shared/raceplan.ts), and real blocks get it through `BlockSeed.track` in [blockplan.ts](../../apps/fartlek/src/shared/blockplan.ts), so the weeks you actually get follow the same targets as the preview. Choices made where the points above left room:

- "Weeks out" counts the race week as 1. Targets: 27 km at 12, 30 at 10, 6 and 4 (32 when the week is at least 64 km), 27 (MP) at 3.
- Rungs below 20 km are left to the ordinary ladder; from there the track adds a minimum rung only when the longest run of the last 30 days is behind it. Weeks between targets keep the 0.4 share, so the long run dips to about 24 km between them.
- The 50 % share applies to the rungs toward a target too, not only the 30+ weeks; otherwise 26–28 km rungs never fit a low-volume week.
- A target week right after a lighter week may return to the level before that lighter week (otherwise the 4-weeks-out run lands at 29.5 km under a 60 km cap).
- A target within two weeks of a B race is capped at 28 km; the B race counts as a run of its distance.
- The marathon window is 40 weeks (was 30); extra weeks go to the base. Specific 6 + taper 2 make up the 8-week race phase.
- If a target is missed (too short a road), the preview warns `longTrackShort`. From 35 km, 38 and 28 weeks reach all five; 20 weeks reaches only two 30s and warns.

## Open

- Warnings (too few weeks to reach 30 km safely, share above the limit, base too small for the goal), cross-training counting toward volume, and fuelling notes on long runs are not decided; take them after the engine change.
- A runner from 35 km sits at the 60 km cap for about 12 weeks (from about 15 weeks out to 3 out), and gets six runs of 26 km or more (27, 28, 30 at 12–10 weeks out). Watch whether that is too much in practice.
