---
title: Fartlek lets a low-volume runner grow by km, not only by per cent
summary: A build week may always grow 2.5 km (not only 10 %), and a block under 40 km climbs 2.5 km a build week from the tolerated load; the spike rule, the km-ramp limit and the form guard stay
type: decision
status: accepted
updated: 2026-11-26
---

# Fartlek lets a low-volume runner grow by km

Raised by the user on 2026-11-25: a year of steady running toward a first marathon, and the planner growing very slowly. The [simulator](fartlek-simulator.md) showed why, on a runner holding about 22 km a week.

## Why the plan stalled

- **Per cent of little is little.** A week could grow at most 10 % on the week before (`COACH.weekGrowth`): 2.2 km at 22 km.
- **The block ramp starts over.** Build weeks aim at the tolerated load × 1.0, 1.05, 1.1, and the next block starts at that block's top week. At 22 km that is 22 → 23 → 24, then 24 → 25 → 26: about 10 % a block, 2.5 % a week. Six months took the runner from 22 to 40 km.

## Decided

- **A build week may always grow `NEXT.lowStepKm` (2.5 km)**, even when that is more than 10 % (`weekCap`): it only matters under 25 km a week. The km-ramp limit (`COACH.rampCap`) still holds.
- **A block under `NEXT.lowVolumeKm` (40 km) climbs 2.5 km a build week** from the tolerated load (22 → 24.5 → 27), more than the ramp's shares; at 40 km and over the ramp is as before. The form guard (a block too deep is scaled down) and the spike rule are untouched. In a marathon plan the long-run track's carry km ([fartlek-marathon-long-run-plan.md](fartlek-marathon-long-run-plan.md)) still win when they are higher.

The reasoning: injury risk follows single sessions far over the longest run of the last 30 days more than weekly km (Frandsen et al., BJSM 2025, the reason for the spike rule), and in novices a weekly increase of up to about 30 % over two weeks was not linked to more injuries than 10 % (Nielsen et al., JOSPT 2014). That makes a few km a week at low volume a safe step, where a flat 10 % was a needless brake. The ground for each number is on [the engine's evidence page](../research/fartlek-engine-evidence.md): the direction is research, 2.5 km and 40 km are our choice.

## What it does

The runner holding about 22 km a week, planned 26 weeks with no race (simulator): before, 22 → 40 km; after, 22 → 51 km a week, and the long run 8.5 → 20 km. The form guard brakes the blocks from about 40 km a week, as designed.

## Passed over

- A higher share of the week for a marathoner's long run (50–55 %, reaching 30 km on a lower week), built on this branch on 2026-11-25 and dropped the next day: the [marathon long-run track](fartlek-marathon-long-run-plan.md), merged meanwhile, plans the long runs back from the race and solves the same stall.

## Open

- The numbers (2.5 km, 40 km) are first guesses; tune them with `npm run sim -w apps/fartlek`.
