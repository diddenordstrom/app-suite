---
title: Fartlek's long-run ceiling and a race's cap on the biggest week
summary: Each race can carry a km cap on its build weeks (suggested 1.5 × proven peak for a half, 1.75 × for a marathon); outside the marathon long-run track the long run takes up to 40 % of a marathon plan's build weeks; the 30 / 32 km split and 3 h limit are replaced by one 32 km ceiling (3.5 h for a marathon)
type: decision
status: accepted
updated: 2026-11-25
---

# Fartlek's long-run ceiling and a race's cap on the biggest week

Settled with the user on 2026-11-25 after the [race plan skeleton](fartlek-race-plan-skeleton.md) was built, and built the same day. It closes two items the skeleton's scenarios raised: the long run topping out at about 24 km in a 20-week marathon plan, and a road that climbs from 45 to about 85 km a week.

> **Partly overtaken (2026-11-25), built the same day:** [the marathon long-run plan](fartlek-marathon-long-run-plan.md) replaces the 30 / 32 km split and the 3 hour limit with one 32 km ceiling (3.5 h in a marathon plan), lets the long run take up to 50 % of the week on the marathon long-run track, and suggests the cap at 1.75 × the proven peak for a marathon. Bullets below marked *(overtaken)* are kept for the reasoning; the cap in km per race, its re-projection, and the 40 % share off the track still hold.

## Decided

- *(overtaken: one 32 km ceiling)* **A plain long run stops at 30 km** (`NEXT.longCeiling.km`), or 3 hours at easy pace, whichever comes first. Runs over 30 km wear the body enough that they are kept for dedicated sessions.
- *(overtaken: one 32 km ceiling, 30 km as the track's target)* **Only a marathon's key long runs go past it, up to 32 km** (`NEXT.longCeiling.keyKm`): a long blueprint of the marathon race phase in a build week (`PHASE_SCHEDULE.marathon`, wip 8, 7, 6, 4 and 3: progressive, MP and fast-finish long runs). The idea is that the ladder reaches about 30 km by the time the race phase starts, holds there, and the distance over 30 comes only with race-specific work.
- *(still holds off the long-run track; on it, up to 50 %)* **The long run's share of the week in a marathon plan: up to 40 %** (`RACE_PLAN.marathonLongShare`) in build weeks from the plan's build phase on (and in any build week of a marathon race phase). Elsewhere `longShareAt` stays (about 36 % at 65 km, 34 % at 80 km). With 40 % a 30 km long run fits a 75 km week instead of needing about 88 km. The 8 % ladder step and the 30-day spike rule still decide how fast it gets there.
- **A cap on the biggest week, set in km per race** (`races.peak_km`). Every build week the block engine plans for the race, and every build week of the road, stays at or under it; the taper and recovery weeks follow, since they are shares of the peak. No cap means today's behaviour: the weeks grow as long as the proven tolerance allows (+10 % on the growth base, re-entry faster up to what was run).
- *(half only; a marathon is suggested at 1.75 ×)* **The suggested cap is 1.5 × the proven peak week, rounded down to 5 km** (`RACE_PLAN.capSuggest`, `suggestedCap`): 55 km proven gives 80 km. It is only a suggestion, shown in "Vägen till …"; nothing is capped until the runner sets a number there or on the race.
- **Changing the cap re-projects the stored skeleton** after the race's last block week (`refreshSkeleton`), so no stored week keeps a target over it. An edit that doesn't send `peakKm` (a new goal, a result) keeps it.

## Why

- **Long-run limits in the books.** Daniels keeps the long run to about 25 % of the week or 150 minutes; Pfitzinger's plans put 32 km long runs in weeks of about 88 km (about 36 %); Hansons stop at 26 km. Very long easy runs add little aerobic benefit over 2.5–3 hours and much more muscle damage, which is why the plain ladder stops at 30 km and the longer runs are race-specific ones with a purpose.
- **40 % only in a marathon plan.** A runner building for a marathon on 70–80 km needs a couple of 30 km runs before the race phase; at 34 % they never come. Outside a marathon plan there is no reason to lean the week on one run.
- **The cap is in km because the runner thinks in weeks.** "No more than 80 km this season" is how a runner sets a limit; a multiple would change under them as the tolerance moves. 1.5 × the proven peak is a season's growth many coaches accept for a careful build (the rate is already about +10 % a block); doubling in one season is possible but is the runner's call.

## Passed over

- **Raising the share for every runner.** It would let long runs eat easy weeks for runners not training for a marathon.
- **A cap as a multiple of the proven peak.** Harder to read and it moves; the multiple is kept as the suggestion.
- **Lowering the per-week growth.** The engine already holds +10 % a week over what was run and has a lighter week every fourth; the road's steepness is the total over a long plan, which a cap handles directly.

## Open

- **Double runs** are not planned. At 80 km six or seven single runs are 11–13 km each; doubles usually come into question from about 110–130 km a week.
- **The threshold session lands on the day after the long run** in a race-phase week whose quality session takes the middle of the week (every free day is as close to a hard day). Not changed here; worth a look with the race phase's day placement.
- **Tune** the 40 %, the 30 / 32 km and the suggestion with `npm run scenarios -w apps/fartlek`: "marathon in 20" now peaks at 27 km at wip 6 (24 before), "marathon in 28" at 32 km.

## Built

Built on 2026-11-25: `NEXT.longCeiling` `{ km: 30, keyKm: 32, min: 180 }` (now `{ km: 32, min: 180, marathonMin: 210 }`), `longRun(…, ceilingKm)`, `longFor(…, minShare)`, `BlockSeed.longShareFrom` and `capKm`, `SkeletonInput.capKm`, `RaceRoad.cap`, migration `0027_race_peak_cap` (`races.peak_km`), the cap row in "Vägen till …" and the field on the race form (A races). The skeleton's golden projection moved on purpose: from the build phase the ladder leads (long-run peak 22 → 23.5 km).
