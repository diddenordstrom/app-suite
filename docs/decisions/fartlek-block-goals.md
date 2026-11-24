---
title: Fartlek plans in goal-driven blocks, re-simulated week by week
summary: "Föreslå block" plans a 2–4 week block as a whole with a km goal, capped by proven tolerance instead of a flat +10 %; "Räkna om resten" re-plans the weeks not started toward the goal; no build block near a race or just after one
type: decision
status: accepted
updated: 2026-11-24
---

# Fartlek plans in goal-driven blocks, re-simulated week by week

Agreed with the user on 2026-11-13 after the week-47 review, mocked, then built the same day. The engine is [shared/blockplan.ts](../../apps/fartlek/src/shared/blockplan.ts) (limits in `BLOCK`), the routes are [routes/blockplan.ts](../../apps/fartlek/src/server/routes/blockplan.ts), and the dialogs are [suggestblock.tsx](../../apps/fartlek/src/client/suggestblock.tsx).

## Why

"Föreslå veckan" ([fartlek-suggest-week.md](fartlek-suggest-week.md)) suggested 16.3 km for week 47: a threshold session of 10.3 km, a 6 km long run and other sports, all flagged "för snällt". The user would have planned 24.3 km (easy Tue, threshold Fri, 10 km long run Sun).

1. **A bug, fixed first.** Today's planned session counted neither as history (not run yet) nor as plan (the plan started tomorrow). That morning week 46 read 14.5 km instead of 22.8, so the cap fell to 16.5 km. The suggestions and the block coach now count today's not-yet-run sessions as planned (`openToday` in [analysis.ts](../../apps/fartlek/src/server/analysis.ts)). With the fix, the reporter's week passes every km check.
2. **Judging one week at a time.** Form reaches the build band over several weeks, not one (already noted in both coach pages). A per-week target is nearly always "too easy", so the engine falls through to other sports. It also can't see that week 1 shapes weeks 2–3.
3. **The race-first wizard in Runna** only plans 8/12/20 weeks before one race and can't start earlier. With the target race many months away, that's irrelevant for most of the year.

## Decision

- **"Föreslå block"** on the Plan page suggests a block of 2–4 weeks (4 by default), starting at the week after the last block, or at a week the runner picks. It is written as a block of kind *base* with a focus as its name ("Bygga volym säkert") and a **km goal** (`blocks.goal_km`), plus every week's sessions and weekly targets. It replaces what was planned in those weeks and can be undone, like the week suggestion.
- **The goal is in km, with fitness shown as the result**: "276 km ≈ kondition 51 → 57". Km is easy to follow week by week; fitness (CTL) is what the goal is really after.
- **Proven tolerance sets the weekly cap, not a flat +10 %** (`tolerance`, `blockWeekCap`). The biggest run week of the last 26 counts in full for 6 weeks, then fades 2 % a week (never below 60 %). Below it a week is *re-entry*: up to +30 % on the growth base, with the ramp up to 1.4, and none after a break (an empty week in the window). Above it the careful cap holds (+10 %, ramp 1.3). A week may always hold the level of the week before. The ramp only flags a week that goes past the tolerance.
- **The whole block is simulated as a chain** (`evaluateBlock`): each week starts with the fitness, fatigue and km window the week before left, and a hard last day carries into the next week's adjacency check. Blocks of 3+ weeks end with a lighter week (70 %). The threshold reps progress over the build weeks (3×8 → 3×10 → 2×15, the lighter week 3×6; since 2026-11-13 the shared ladder from the rung the history left, and too easy tries a faster long-run finish instead of longer reps, see [key sessions first](fartlek-key-sessions-first.md)). The block is judged on its deepest build week, like the block coach. When too easy it tries, in order: longer reps, a second threshold session in the last build week(s) (four run days), then other sports. When too hard: 10 % and 20 % lighter.
- **"Räkna om resten"** on a block that has started re-plans the weeks not started toward the goal. Remaining goal = goal − km done, aimed at by scaling the caps (bisection). What doesn't fit inside the caps shrinks the goal, and the dialog says so ("Målet justeras till … Det är helt okej") when it is more than 3 % short. A week with a session skipped for sickness or injury is never caught up: the rest keeps its planned size within the caps. Saving rewrites those weeks and sets the goal to km done plus the new plan. It is offered, never run on its own. The button turns primary when a finished week is more than 10 % off its target.
- **Far from a race, the block aims at fitness.** ~~An A or B race within 16 weeks of the start refuses a suggestion; race mode in the block editor plans those weeks.~~ Since 2026-11-16 a race within 16 weeks is planned toward instead, see [race blocks](fartlek-race-blocks.md). An A or B race in the 14 days before the start refuses too, so that a build block doesn't come straight after a marathon. Re-plan also leaves race weeks to race mode.
- **Week checks shared with "Föreslå veckan"** (the long-run share is superseded by the 30-day rule, see [key sessions first](fartlek-key-sessions-first.md)): the long run share depends on the number of runs (50 % with two, 42 % with three, otherwise 35 %). The long run is the week's longest: at least as long as a threshold session where the easy runs keep their 3 km, and at least 1 km over each easy run. Time at threshold over 25 % of the week's km is flagged, and the block engine shortens the reps (and drops reps, down to 2) to stay inside it. Two hard days in a row are flagged across the week boundary too (`hardBefore`).
- **Where a session lives**: in the calendar, as before. A block is start week + length, and sessions belong to it by date, so there is no second copy to drift.
- **Never a lock**: every session in the dialog can change type, length and day (dragged across the whole block), and "Använd" always works.

## Passed over

- Writing only the next week with the rest as a preview: the whole block is the plan, and re-planning covers what changes.
- Re-planning automatically after each week: it would change the plan behind the runner's back.
- Making a wizard the entry point: the dialog states what the block aims at, which was the point. A first-run starter can still come later and produce the same block.

## Open

- Loose planned weeks outside blocks are not wrapped into blocks yet; "Föreslå veckan" stays for them.
- A recovery block after a race is not generated. (Race blocks inside the 16 weeks are, since 2026-11-16: [race blocks](fartlek-race-blocks.md).) Decided 2026-11-24: the next block starts with recovery weeks, see [post-race recovery](fartlek-post-race-recovery.md) (built).
- Whether the block coach and the block engine merge into one (they judge the same deepest week but are separate code).
- ~~Whether the race window should depend on distance.~~ Decided 2026-11-24 in [race plan skeleton](fartlek-race-plan-skeleton.md): 30 weeks for an A marathon, 20 for a half, 16 for the rest.
