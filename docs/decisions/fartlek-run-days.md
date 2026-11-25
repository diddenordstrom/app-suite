---
title: Fartlek's engine sizes easy runs from the week and asks for another run day
summary: Easy runs are a share of the week's km (so fewer, longer ones as volume grows), and a suggested week or new block that needs more run days than the runner has asks which day to add, then simulates again; nothing is locked
type: decision
status: accepted
updated: 2026-11-25
---

# Fartlek's engine sizes easy runs from the week and asks for another run day

Settled in a chat with the user on 2026-11-14. It extends [key sessions first](fartlek-key-sessions-first.md) (the long run and threshold ladders stay as they are) and [suggest a week](fartlek-suggest-week.md); both the week and the block dialogs use it. Code: `build`, `daysFor`, `daysAdvice` in [`shared/nextweek.ts`](../../apps/fartlek/src/shared/nextweek.ts), `MoreDays` in [`client/suggestweek.tsx`](../../apps/fartlek/src/client/suggestweek.tsx).

## Why

With all seven days open the engine put an easy run on every one: 40 km became seven runs of 3–4 km, 20 km three or four, and 60 km seven with no day off. The number of sessions was whatever the open days and the 3 km minimum left over. A 3-day runner who needed 40 km had the opposite problem: the easy runs are capped at the long run − 1 and by the 30-day rule, so the week silently landed under its target.

## Decided

- **Easy runs are a share of the week's km.** Ideal length is 12 % of the week, between 5 and 10 km (`NEXT.easy`): 40 km → 5, 60 → 7, 80+ → 10. The number of easy runs is what is left after the long run and threshold divided by that, so the engine uses 5–6 run days at 40 km, 6 at 60, 7 around 80, and the last days of the week stay free (the day before the long run first). There is no separate easy-run ladder: the week grows at most +10 % and the easy runs are still capped by the long run − 1, so they grow in step with the week. Easy runs stay the lowest priority and fill what is left.
- **Run days a week calls for** (now `TUNE.daysFromKm`): 3 up to 25 km, 4 up to 50, 5 up to 55, 6 up to 70, 7 from there. A table, easy to tune. **Changed 2026-11-25:** five days from 50 km, not 40, so a four-day runner around 40–46 km a week is not asked for a fifth day; four days hold that volume with the easy runs at most half the long run ([fartlek-block-progression.md](fartlek-block-progression.md)).
- **Two signals ask for another day**, both read off the simulated plan (`daysAdvice`): the biggest build week calls for more days than the runner has (`peak`), or a week can't be spread over the days it has (`fit`: it falls more than 1 km short of its target). A lighter week doesn't count towards the peak.
- **Where and when:** in the "Föreslå vecka" and "Föreslå block" dialogs, after the simulation. Never for a block that is running (the re-plan dialog doesn't get the advice), never mid-block. The dialog says why, lists the free days (the one furthest from the long run and threshold first) and asks which. A pick is **added to the run days in the settings** straight away (not just for the block) and the simulation runs again, which may ask for one more. **"Fortsätt ändå"** keeps the days as they are; the refusal isn't remembered, so the next suggestion asks again.
- Nothing is locked: the editor opens as before, and "Använd" always works.
- **Superseded in part later on 2026-11-14:** easy runs are no longer 12 % of the week (5–10 km) but at most half the long run, split into as few as that takes ([fartlek-block-progression.md](fartlek-block-progression.md)); `NEXT.easy` and `easyIdealKm` are gone.
- **Amended later on 2026-11-14:** a signal now only starts a trial plan with each free day added, and a day is offered only if it changes the plan ([fartlek-block-progression.md](fartlek-block-progression.md)). Before that the question could repeat until all seven days were run days.

## Passed over

- Forcing the day count or making the dialog a multi-step wizard. A wizard is still an option if more steps turn up; for now one conditional step in the existing dialogs is enough.
- Remembering a "no". Asking again in the next suggestion is cheap and the runner may have changed their mind.
- Hysteresis on `daysFor` (up at 50, down only below ~44). Only upward advice exists, and the days are the runner's setting, so there is nothing to flip back.
- Double sessions: the suggestion places one session a day, and 50–60 km doesn't need two.

## Open

- The constants (0.12, 5–10 km, the day table) are first guesses; tune them on real histories (`npm run scenarios -w apps/fartlek`).
- A "fewer days would do" hint for someone with more days than the volume needs; today the extra days simply stay free.
