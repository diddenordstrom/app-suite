---
title: Fartlek period stats: time in zone, threshold and target pace over any period
summary: A new stats page for a chosen period (day, week, month, block, custom) with time in HR zone, time below / at / above threshold pace (grade-adjusted) and time at the plan's target pace, shown as key figures for one period against another; meant to replace Trends in time
type: decision
status: accepted
updated: 2026-11-26
---

# Fartlek period stats: time in zone, threshold and target pace over any period

Settled 2026-11-26. The server side (the stored per-run aggregate and GET /api/stats) is built; the page is being built. The idea: look at training through one chosen period and see how the time was spent, instead of reading trends over a fixed window.

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

**How the aggregate is stored** (built). One row per run in `activity_bands` ([`server/bands.ts`](../../apps/fartlek/src/server/bands.ts), the computation in [`shared/bands.ts`](../../apps/fartlek/src/shared/bands.ts)), holding the seconds and the inputs they came from: a version, the threshold pace on the run's date, today's target pace, which zones (the runner's or the watch's) and the run's detail (status and parse version). A row whose inputs no longer match is computed again. A new threshold estimate redoes only the runs it covers, a new target or new zones redo every run, and a stream that arrives after the run was first counted gets used. Rows are filled after each sync and by a background backfill at startup. When the page is read they are also filled within a time budget, the page's periods first; whatever is left carries on in the background, and the response says how many runs of the two periods are still waiting. The stream is the kept FIT file at 1 s with GAP, else the stored ~5 s one, as for best efforts. Each sample counts its gap to the next one, capped at 30 s, as the zones do. Samples slower than 1 m/s count as standing still and fall in no pace band. A run without a stream gets the watch's zones and its duration, and no pace bands.

**Target pace** is the goal pace of the next A race (on or after today) with a goal time. Without a goal, its locked race pace is used. The "at" band is ±3.5 % for now (`BAND_SHARE`).

**The response** (`GET /api/stats?from&to&cmpFrom&cmpTo`, contract in [`shared/periodstats.ts`](../../apps/fartlek/src/shared/periodstats.ts)):
- Totals per period, summed from the rows.
- Plan against done, from the run sessions dated in the period. They are matched to runs the way the plan page matches them: done or short counts as done, and key sessions are the plan's key types (long, threshold, intervals and race).
- The runs of both periods, each with the kind of session it matched.
- Weekly run km over at least 12 Monday weeks covering both periods, and the blocks in that span.

With no periods given, this month to today is compared with the same days of last month. With only A given, it is compared with the same number of days just before it. A period may be up to 400 days.

**Running only.** Gym and cross-training stay out of the pace and zone bands, since their HR is judged against running zones today. They show as plain time. Later, once thresholds per sport exist ([roadmap](fartlek-roadmap.md)), the page can filter per sport.

**Filtering the activity list** by the same measures: "runs with at least 10 min at threshold", "runs with time at target pace", "runs with time above threshold".

## Where it goes

A new page, built beside Trends first. Trends stays until the new page covers what it shows (threshold, easy pace, durability, critical speed, intensity distribution, HRV and resting HR); the charts that fit a period move over, the long-term curves stay as history. When nothing on Trends is missing from the new page, Trends is removed and the route redirects. Not a rewrite: the cards are reused.

## Build order

1. Period picker and the per-run aggregate (zones first, then threshold and target bands). The aggregate and the endpoint are built.
2. The key-figure view with the two-period difference.
3. List filters, then moving cards over from Trends.

## Open

- The exact "at" width (3 % or 5 %; 3.5 % for now), tuned on real runs.
- Whether easy-pace and durability fit a period view or stay on a history page.
