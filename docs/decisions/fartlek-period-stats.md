---
title: Fartlek period stats: time in zone, threshold and target pace over any period
summary: A new stats page for a chosen period (day, week, month, block, custom) with time in HR zone, time below / at / above threshold and time at the next A race's target pace, compared with another period; meant to replace Trends in time
type: decision
status: open
updated: 2026-11-26
---

# Fartlek period stats: time in zone, threshold and target pace over any period

Proposed 2026-11-26, not built. The idea: look at training through one chosen period and see how the time was spent, instead of reading trends over a fixed window.

## What exists

- Time per HR zone per run: `zoneSecs` from Garmin, or recomputed from the stored stream with the runner's own zones ([`shared/zones.ts`](../../apps/fartlek/src/shared/zones.ts)).
- Threshold pace and HR estimates, intensity distribution, critical speed and a block-versus-previous-block comparison for best efforts, all on [Trends](../../apps/fartlek/src/client/pages/Trends.tsx), each with its own time window.
- A goal time per race ([`goalPace`](../../apps/fartlek/src/shared/recovery.ts)).

What is missing is one period that drives everything, and time spent at a pace rather than only in an HR zone.

## Proposal

**A period picker** shared by the whole page: today, this week, last week, a chosen ISO week, this month, last month, this block, last block, and a custom date range. A compare mode puts the period next to the one before it (last week, last month, previous block) or any other chosen period. The choice survives moving between views.

**Summary for the period:**

- Total time, distance, number of runs, longest run.
- **Time in zone**, zones 1–5, as bars with the comparison beside them.
- **Time relative to threshold**, in three bands: below (sub-threshold), at, and above threshold. The "at" band is a margin around the threshold pace; its width and whether it is judged on pace or HR are open (below).
- **Time at target pace**: the goal pace of the next A race (from its goal time and distance), with the same kind of margin. No A race or no goal time: the row is hidden, or the runner may pick a pace by hand.
- Plan against actual for the period (planned km, done km, missed sessions).

**Filtering the activity list** by the same measures: "runs with at least 10 min at threshold", "runs with time at target pace", "runs with time above threshold".

## Where it goes

A new page, built beside Trends first. Trends stays until the new page covers what it shows (threshold, easy pace, durability, critical speed, intensity distribution, HRV and resting HR); the charts that fit a period move over, the long-term curves stay as history. When nothing on Trends is missing from the new page, Trends is removed and the route redirects. Not a rewrite: the cards are reused.

## Open questions

- **Threshold on pace or HR?** Pace is what the runner thinks in but is noisy on hills and in wind; HR lags in short reps. Candidate: pace as the main measure with a grade-adjusted pace if the stream has elevation, HR as a fallback when pace is missing.
- **Band widths.** A first guess is ±3 % of threshold pace for "at" and ±3 % of target pace for "at target", to be tried on real runs before it is fixed.
- **Compute on read or store?** Stream samples are about 5 s apart, enough for minutes in a band. Computing from the streams on each page load may be slow over a block or a year; a per-activity row of band seconds, filled at sync and when thresholds or goals change, is the likely answer.
- **Which threshold applies to an old run?** The threshold at the time (history exists) or today's. Judging past runs against today's threshold makes a period look worse when fitness has grown.
- **Other sports.** Time in zone for cross-training and gym is judged against the running zones today, which is wrong for the bike or swim; leave them out of the pace bands and show them as plain time until [per-sport thresholds](fartlek-roadmap.md) exist.
