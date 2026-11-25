---
title: Fartlek marathon plan for a low-volume runner: long runs over 30 km need their own track
summary: Open. Why a marathon plan for a runner with a 35 km proven peak week never gets a long run past about 21 km, and the key points to decide (long-run track, week volume, peak cap, ladder, tempo, taper, B-race, warnings) before changing the engine
type: decision
status: open
updated: 2026-11-25
---

# Fartlek marathon plan for a low-volume runner: long runs over 30 km need their own track

Raised on 2026-11-25 when a runner with a proven peak week of about 35 km, a marathon far out and a half marathon on the way was shown a plan whose longest run stopped at about 21 km while the plan itself warned that under 25 km tends to give a slower finish. Nothing is decided yet; this page collects what to decide. It builds on [long-run ceiling](fartlek-long-run-ceiling.md) and the [race plan skeleton](fartlek-race-plan-skeleton.md), and the answers should land in those (or supersede them).

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

## Key points to decide

1. **Long-run target.** How many runs of 30 km or more, and how many of 26–29 km, before the taper? Lean: 3 of 30–32 km and 2 of 26–28 km, the last 30+ run about 3–4 weeks before the race.
2. **A long-run track independent of the week share.** The runs are planned backwards from the race as their own ladder (for example 21 → 24 → 27 → 30 with a lighter run every third), and the week is sized to carry them, instead of the long run being a share of a week. Is that the model, or only a higher share?
3. **Week volume needed to carry a 30+ km run.** What weekly peak do we aim for, and what is the highest share of the week the long run may take (a hard limit, 40 → 50 %?) and at what volume does a 30 km run become acceptable? Lean: let the weeks reach 55–65 km in the specific phase and allow up to about 50 % in the weeks that carry a 30+ run, with the other days kept short and easy.
4. **The peak cap.** Replace "1.5 × proven peak" with something that depends on the race distance (a marathon needs more than a half), or keep the cap but let weeks with a key long run pass it. Does the cap stay a hard limit at all, or only a warning?
5. **Ceilings.** Raise the 3-hour limit for a marathon (to 3.5 h, or no time limit up to 32 km)? Is 32 km the hard maximum, or may the last key long run go to 34–35 km? Today plain runs stop at 30 and only key sessions reach 32.
6. **Growth rate.** The engine holds about +10 % a week on what was actually run, with a lighter week every fourth. With a long road is that still right, or should the first phase be slower and the specific phase steeper? How do we guard against a runner who is hurt or sick mid-road (the ladder holds at the longest run, a missed run repeats the step)?
7. **Phases and length of the road.** More weeks to build means a longer base. Do base weeks grow the long run (to 18–20 km) or only the volume? Does the skeleton need to cover a marathon further out than 30 weeks, and is the phase split (base, build, specific, taper) the right shape for a 38-week road with an intermediate race?
8. **An intermediate race (a half marathon on the way).** Planned as a B race with its own taper and recovery, or as a hard long run inside the build? What does it do to the long-run ladder (does the race count as a long run, how long is the pause after it, does the ladder restart at the race distance)? Today a half is a "lighter week plus recovery"; it should also be a test of marathon pace potential.
9. **Race-specific long runs.** Which of the 30+ runs are plain easy, which have marathon-pace blocks or a fast finish (the existing blueprints), and how many of each? One run should rehearse fuelling and shoes; should the app say so?
10. **Taper.** Length (2 or 3 weeks), volume drop per week and the last long run's distance. Is the current taper right for a runner whose peak week is lower than the books assume?
11. **Warnings and honesty.** The plan already warns when the longest run is under 25 km. Should it also warn when the weeks are too few to reach 30 km safely, when the share of the week is above the limit, or when the proven base is too small for the goal time? Is "not enough time" a refusal or a warning (it is never a refusal today)?
12. **Cross training and gym days.** Does cycling or pool running count toward the week's volume or only toward load (so it can fill the days between long runs without adding impact)? Interplay with the gym module's leg days around long runs.
13. **Fuelling and pace practice.** Out of scope for the engine now, but should long runs carry a note (carbs per hour, shoes, route)? Leave for a later page unless it changes the plan.
14. **How the user stays in control.** The coach proposes, the user can raise or lower the long-run target per race and the peak cap, and the preview ("Vägen till …") shows the long-run ladder as its own line so the effect is visible before accepting.
15. **Testing.** Run `npm run scenarios -w apps/fartlek` for marathon at 38, 28 and 20 weeks, from a proven 35 km and from 55 km; the targets above become tests in `raceplan.test.ts` and `nextweek.test.ts`.

## Passed over (so far)

- **Just raising `marathonLongShare`.** It fixes the symptom but makes every week lean on one run and gives no schedule of how many long runs the plan reaches.
- **Doubling the peak cap.** Volume alone does not guarantee the long runs; they need a target of their own.

## Where it would be built

`NEXT.longCeiling` and `longRun`/`longFor` in `apps/fartlek/src/shared/nextweek.ts`; `RACE_PLAN` (`marathonLongShare`, `capSuggest`, `longPeak`) and the skeleton in `apps/fartlek/src/shared/raceplan.ts`; the phase schedule and blueprints in `racephase.ts` and `blueprints.ts`; the preview in `apps/fartlek/src/client/suggestblock.tsx`.

## Open

- The date the app uses for the race versus the date the runner expects (28 weeks shown, a longer road assumed) is worth checking before tuning: it decides whether the skeleton covers the whole road.
- Answers to points 1–15, to be taken one by one in the next session; settled ones move to a decision page and mark [long-run ceiling](fartlek-long-run-ceiling.md) as superseded where they replace it.
