---
title: Fartlek judges form as a share of fitness, and as a guard rather than a target
summary: Form bands (fresh, building, heavy) are judged on (fitness − fatigue) / fitness, as intervals.icu does, instead of Friel's absolute TSB; a week above the build band is "calm" and fine, and the engines no longer add load to reach it
type: decision
status: accepted
updated: 2026-11-13
---

# Fartlek judges form as a share of fitness, and as a guard rather than a target

Settled with the user on 2026-11-13, right after [key sessions first](fartlek-key-sessions-first.md). Code: `formPct` and `formState` in [`shared/load.ts`](../../apps/fartlek/src/shared/load.ts), used by the week engine ([`nextweek.ts`](../../apps/fartlek/src/shared/nextweek.ts)), the block suggestion ([`blockplan.ts`](../../apps/fartlek/src/shared/blockplan.ts)), the block coach ([`coach.ts`](../../apps/fartlek/src/shared/coach.ts)), the Idag score ([`recovery.ts`](../../apps/fartlek/src/shared/recovery.ts)) and Home.

## Why

The user asked how the engine would ever get a week into the build band once the threshold session couldn't grow, and whether form is relevant for runners at all ("it feels like it takes a lot to end up in the build band").

The model (fitness 42 days, fatigue 7 days, form = fitness − fatigue) is fine for runners. The bands were the problem. Building was form −10 to −25 and too hard was under −30, in absolute numbers. Those are Joe Friel's TSB zones, from cyclists with a fitness near 100. At the user's fitness of about 27, −10 is more than a third of his fitness, reachable only by load that the safe-volume rules (+10 % a week, the 30-day rule, 15 % threshold) forbid. So a week the rules called right still read "För snällt", and the engine kept adding a faster finish, a second threshold session and other sports to push it down. His week 47 at form −7.6 was −28 % of fitness: in the middle of the build band.

Sources read: intervals.icu shows form as a share of fitness by default for new athletes, because that "makes the form zones more applicable to athletes with less than 100 fitness" ([forum](https://forum.intervals.icu/t/form-as-a-percentage-of-fitness/869)). The TrainerRoad forum points out that "long steady increases in workload take a long time to get you in the optimal training zone" and that it "is probably not something that mere mortals will spend much time in" ([forum](https://www.trainerroad.com/forum/t/thoughts-on-intervals-icu-data-breakdown/24698?page=15)).

## Decided

- **Form is judged as a share of fitness:** `formPct = (fitness − fatigue) × 100 / max(fitness, 40)`. The bands keep their numbers, now in %: fresh above +5 %, building −10 % to −25 %, too hard under −30 % (`COACH.floor`), race day +5 % to +20 % (was +15, absolute).
- **Up to a fitness of 40 the share is taken of 40.** The first version used a floor of 20, and the user's next try overcorrected ("Överkompenserar vi inte nu? 😅"): at his fitness of 23, a normal week at −7.6 became −33 %, "För hårt", and the block cut zone 2 to almost nothing. That is intervals.icu's known weak spot with percentages: at low fitness the bands get so tight that they "seriously slow down your initial fitness building". With 40, low fitness gets the bands of a fitness of 40: building −4 to −10, too hard under −12. −7.6 on 23 is −19 %, building; −0.7 is calm. At fitness 40 and above it is the pure share.
- **Form is a guard, not a target.** "Too hard" still backs off: a rung down, fewer zone 2 km, no threshold session. A week above the build band is **calm** ("Lugn vecka", "Lugnt") and fine. The week and block suggestions then only try a faster finish on the long run; a second threshold session and other sports are no longer added to reach the band. The block coach still offers its "more" tips for a calm block, worded as optional.
- **Shown both ways.** The number stays fitness − fatigue (as on the watch); the label, colours, bands and charts go by the share. On Home the number has the label and the share under it ("bygger · −22 %"). The form charts in the week and block dialogs and the block coach plot the share, with the band in %. The Idag score's form signal slides from −25 % to −40 %.

## Passed over

- Keeping absolute numbers and lowering the band for low fitness: a band per fitness level is the same thing as a share, only harder to explain.
- Dropping form altogether: it is still the best guard against too much load in one week, and the weekly km rules don't see intensity.

## Open

- Race mode's taper tips are judged on the share now too (+5 % to +20 %); not yet checked against a real taper.
