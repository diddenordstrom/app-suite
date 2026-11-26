---
title: Fartlek period stats: time in zone, threshold and target pace over any period
summary: A new stats page for a chosen period (day, week, month, block, custom) with time in HR zone, time below / at / above threshold pace (grade-adjusted) and time at the plan's target pace, shown as key figures for one period against another; meant to replace Trends in time
type: decision
status: accepted
updated: 2026-11-26
---

# Fartlek period stats: time in zone, threshold and target pace over any period

Settled 2026-11-26, not built. The idea: look at training through one chosen period and see how the time was spent, instead of reading trends over a fixed window.

## What exists

- Time per HR zone per run: `zoneSecs` from Garmin, or recomputed from the stored stream with the runner's own zones ([`shared/zones.ts`](../../apps/fartlek/src/shared/zones.ts)).
- Threshold pace and HR estimates, intensity distribution, critical speed and a block-versus-previous-block comparison for best efforts, all on [Trends](../../apps/fartlek/src/client/pages/Trends.tsx), each with its own time window.
- A goal time per race ([`goalPace`](../../apps/fartlek/src/shared/recovery.ts)).
- Grade-adjusted speed (GAP) is already used by best efforts and the race models when at least half the samples have it ([`shared/bestefforts.ts`](../../apps/fartlek/src/shared/bestefforts.ts)), but it is only in the on-demand parse of a stream and never stored.

What is missing is one period that drives everything, and time spent at a pace rather than only in an HR zone.

## Decisions

**A period picker** shared by the whole page: today, this week, last week, a chosen ISO week, this month, last month, this block, last block, and a custom date range. The page compares **a chosen period with another chosen period** (the default is the one before it). The choice survives moving between views.

**Key figures, shown as the difference between the two periods** ("selected against selected"). No generated sentence: the numbers and their change are the message.

- Total time, distance, number of runs, longest run.
- **Time in zone**, zones 1–5.
- **Time relative to threshold, in three bands: below, at and above.** Judged on **grade-adjusted pace**, with pace as the fallback when a stream has no GAP. "At" is **±3–5 %** of threshold pace (a runner with a 4:45 threshold aims at about 4:40–5:00; the width is tuned on real runs). On heart rate there is no separate threshold band: threshold on HR is **time in zone 4**, which the zone bars already show.
- **Time at target pace**, judged on GAP with the same margin. The target is **today's target pace for the plan** (the plan's A race goal), not the one that held when the run was made: the row means "compare training data with X", where X is the pace being worked towards now. No A race or no goal time: the row is hidden.
- Plan against actual for the period (planned km, done km, missed sessions).

**Threshold at the time.** A past run is judged against the threshold that held on its date (the history exists), so a period three months back does not look worse because fitness has grown. Only the target pace is "as of today".

**Aggregate at sync.** Each run gets stored seconds per band (zones, below / at / above threshold, at target), filled when the activity is synced and recomputed when thresholds, zones or the target change. The page then sums rows instead of reading streams, and GAP, which is not stored in the stream, is used once while the stream is parsed. The target row has to be recomputed whenever the target moves, because it is judged against today's value.

**Running only.** Gym and cross-training stay out of the pace and zone bands, since their HR is judged against running zones today. They show as plain time. Later, once thresholds per sport exist ([roadmap](fartlek-roadmap.md)), the page can filter per sport.

**Filtering the activity list** by the same measures: "runs with at least 10 min at threshold", "runs with time at target pace", "runs with time above threshold".

## Where it goes

A new page, built beside Trends first. Trends stays until the new page covers what it shows (threshold, easy pace, durability, critical speed, intensity distribution, HRV and resting HR); the charts that fit a period move over, the long-term curves stay as history. When nothing on Trends is missing from the new page, Trends is removed and the route redirects. Not a rewrite: the cards are reused.

## Build order

1. Period picker and the per-run aggregate (zones first, then threshold and target bands).
2. The key-figure view with the two-period difference.
3. List filters, then moving cards over from Trends.

## Open

- The exact "at" width (3 % or 5 %), tuned on real runs.
- Whether easy-pace and durability fit a period view or stay on a history page.
