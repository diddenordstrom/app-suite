---
title: Fartlek takes sleep from Garmin, not from the check-in
summary: Today's form uses Garmin's sleep score (under 60 is poor); the sleep question is gone from the daily check-in; old manual values are only a fallback
type: decision
status: accepted
updated: 2026-11-11
---

# Fartlek takes sleep from Garmin, not from the check-in

> **Partly superseded** by [fartlek-readiness](fartlek-readiness.md): sleep now slides from 70 to 40 (max 1.5 off) instead of 1 point under 60, it can move the verdict like any deduction, and the manual sleep fallback is gone. Syncing the score from Garmin still stands.

## Decision

- The Garmin sync stores the overall sleep score (0–100) per night in `wellness.sleep_score`, next to HRV, resting HR and Body Battery.
- In the form score, a sleep score under `POOR_SLEEP_SCORE` (60, Garmin's "poor" band) costs 1 point. Only the latest night within today or yesterday counts.
- The daily check-in no longer asks about sleep. Soreness and mood stay manual, since the watch can't know them.
- Check-ins saved before this change keep their sleep value and still count (1 point off for ≤ 2/5), but only when Garmin has no score for those days.
- Sleep only affects the form score, not the verdict, as before. Home shows the score as its own row.
- The last 7 days are refetched on sync while a day has no sleep score, so older rows fill in once and watches that don't track sleep cost a few extra calls per sync.

## Reasons

- It removes a daily chore and replaces a gut-feel 1–5 with a measured value.
- The same data source already feeds HRV and resting HR.

## Open

- The first version used the Connect web API's `dailySleepData` path, which the Personal API answers with 404. Found with real requests on 2026-11-11: `dailySleep?date=` returns a flat object with `sleepTimeSeconds` and `sleepScores.overall.value` (a separate `dailySleepSummary?date=` returns the same). A failed sleep call is still only logged, so the Sömn row just shows "ingen data"; making that visible in the sync result is not done yet.
- Whether 60 is the right threshold, and whether to use sleep duration as well.
- Related and still open: the window for soreness (latest check-in today, versus an average over 2–3 days). See [PR #33](https://github.com/diddenordstrom/app-suite/pull/33).
