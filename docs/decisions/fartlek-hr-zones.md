---
title: Fartlek's five HR zones put threshold HR in zone 4
summary: Zones from threshold HR are 80 / 89 / 95 / 102 % (recovery, easy, tempo, threshold, over), replacing Friel's 84 / 89 / 94 / 99 %, which put the threshold in zone 5 once his seven zones were cut to five
type: decision
status: accepted
updated: 2026-11-26
---

# Fartlek's five HR zones put threshold HR in zone 4

Decided 2026-11-26, after the [period stats](fartlek-period-stats.md) page showed a runner over an hour in zone 5 but only about half an hour at threshold pace.

## The model

Five zones, read the same way everywhere in the app and on the watch:

| Zone | Meaning | Share of threshold HR |
| --- | --- | --- |
| 1 | Recovery | under 80 % |
| 2 | Easy | 80–89 % |
| 3 | Tempo | 89–95 % |
| 4 | Threshold | 95–102 % |
| 5 | Over threshold | over 102 % |

"From threshold HR" in Settings fills the four upper bounds with these shares ([`zonesFromLthr`](../../apps/fartlek/src/shared/zones.ts)). With a threshold HR of 170: 136 / 151 / 162 / 173. "From max HR" (60 / 70 / 80 / 90 %) also puts a typical threshold in zone 4, like the watch's zones.

## Why it changed

The button used Joe Friel's running zones, 84 / 89 / 94 / 99 % of threshold HR. Friel has seven zones (1, 2, 3, 4, 5a, 5b, 5c) and the threshold starts zone 5a. Taking his first four bounds into a five-zone model put the threshold at the start of zone 5, so threshold work showed as zone 5 while the rest of the app (structured workouts, the period stats, "zone 4 is the HR threshold") reads zone 4 as threshold.

## Consequences

- Saved zones are the runner's own numbers and do not change by themselves. Settings says when the latest threshold HR falls outside zone 4 with the saved zones and suggests pressing "From threshold HR".
- Time in zone per run is recomputed from the streams when the zones change ([period stats](fartlek-period-stats.md), stale detection on the zones used).
- The demo runner's zones come from the same function (threshold HR 169).
