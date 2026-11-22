---
title: Fartlek finds interval laps against the threshold estimate
summary: Interval laps are ≥ 3 min and at most 10 % slower than the threshold estimate; without one, near the median of the work laps instead of the fastest lap
type: decision
status: accepted
updated: 2026-11-11
---

# Fartlek finds interval laps against the threshold estimate

## Decision

Garmin leaves lap intensity empty, so Fartlek decides which laps of a flagged threshold session are the work. The rule is `intervalLaps` in [shared/threshold.ts](../../apps/fartlek/src/shared/threshold.ts), with its numbers in `INTERVAL`:

- A lap must be at least 3 minutes; shorter laps are rest, strides or warm-up bits.
- **With a threshold estimate:** a lap counts if its pace is at most 10 % slower than the estimate (5:21 → 5:53). Laps between the range's slow edge (+20 s) and that limit still count and are labelled "too slow".
- **Without one, or if the estimate finds nothing** (an estimate far too fast must not lock the session out of correcting it): take the laps within 10 % of the fastest as the work group, and count laps within 5 % of that group's median pace.

The same laps feed the activity's lap list, the threshold chart and the threshold proposal.

## Reasons

- The old rule kept laps within 5 % of the session's *fastest* lap. In a real 4 × 4 min session (5:17, 5:10, 5:06, 5:00) the eager last rep set the bar at 5:15.8, so the first rep fell out although it was the only one inside the runner's "right pace" range.
- Work and rest differ far more than 10 % in pace (here about 5:10 vs 9:40), so a generous margin around the estimate finds what is *trying* to be an interval without picking up warm-up or rest.
- The median, not the fastest lap, keeps one fast rep from setting the bar when there is no estimate.

## Passed over (for now)

- A manual "interval / rest" toggle per lap. Worth adding later as an escape hatch for odd sessions; the automatic rule should be right most of the time.

## Open

- A session run mostly faster than the range (the 4 × 4 above was closer to VO2max pace) still pulls the threshold chart and the proposal faster. Whether such sessions, or their "too fast" laps, should be left out of the proposal is undecided.
- The activity list lets you flag anything as threshold. A "flag the suggested ones" action that picks sessions whose laps match, and tempo and long run as session types, are planned for later.
