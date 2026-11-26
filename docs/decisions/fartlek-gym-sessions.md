---
title: Fartlek plans gym as its own session type, apart from cross-training
summary: A planned "Gym" (strength) session matches only gym activities, and cross-train sessions never take a gym activity, so gym on Monday and swimming on Thursday each fill their own day
type: decision
status: accepted
updated: 2026-11-25
---

# Fartlek plans gym as its own session type, apart from cross-training

Asked for by the user on 2026-11-18: gym on Mondays and swimming on Thursdays, without the gym activity being matched to the week's "Alternativträning".

## Why

Cross-train sessions took the first non-run activity of the week (`matchWeek`, step 4 in [`shared/matching.ts`](../../apps/fartlek/src/shared/matching.ts)). A Monday gym session therefore filled Thursday's swim, and the swim then showed up as an unplanned extra. Gym was also only an alias for `cross` in the block text.

## Decided

- New workout type `strength` (label "Gym" in both languages; block text `gym`, `styrka` and `styrketräning` also parse to it). `swim`, `bike` and the rest stay `cross`.
- **Matching:** `strength` sessions take Garmin `strength_training` activities (nearest day first); `cross` sessions take any other non-run activity and never a gym one. Manual links still win.
- A gym session counts for no km and stays out of the suggestion engine and plan replacement (`workoutWeeks` skips it like rest and races), so "Föreslå vecka" never rewrites or drops it. Planned load uses an intensity factor of 0.55.
- Today's open sessions: a gym session counts as open until a gym activity is synced, a cross session until some other non-run, non-gym activity is.

## Open

- ~~The suggestion engine and Skapa block don't place gym sessions.~~ They do since 2026-11-25, on the days the runner gives: see [fartlek-gym-cross-days.md](fartlek-gym-cross-days.md).
