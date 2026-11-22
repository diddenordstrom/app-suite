---
title: Fartlek plans the key sessions first, with the long run on a 30-day ladder
summary: Week and block suggestions place the long run (longest run of 30 days + 1 km, never more than 10 % over it), then the next threshold rung, then fill with zone 2; one dial; the 35 % long-run share is gone; Home offers to fix a key session ahead after a missed one
type: decision
status: accepted
updated: 2026-11-14
---

# Fartlek plans the key sessions first, with the long run on a 30-day ladder

Settled in a chat with the user on 2026-11-13, written up first in the Claude doc **"Fartlek – förslagsmotorn v2"**. It replaces the search order of [suggest a week](fartlek-suggest-week.md) and the session rules shared with [the block suggestion](fartlek-block-goals.md). Code: [`shared/nextweek.ts`](../../apps/fartlek/src/shared/nextweek.ts) (both engines build their weeks there), [`shared/blockplan.ts`](../../apps/fartlek/src/shared/blockplan.ts).

## Why

Week 47–48 suggested through both buttons showed the problem. The long run was set to "at least as long as the threshold session", so it stayed at 9.5 km while the easy runs grew from 4.5 to 6.5 km. In the block it only reached 10.5 km because the threshold session became 3×10. "Föreslå veckan" repeated 3×8 every week, and it came out under its own target (28.1 of 28.6 km) because the easy runs were rounded down. For a marathon build (the user's goal is August 2027) the long run has to keep growing. The user wanted "a simple, clear engine instead of one that huffs something out that is never right".

## Decided

**Order when a week is built** (`build`), the same for the week and the block:

1. **The long run, on its own ladder** (`longRun`): the longest run of the 30 days before the week + 1 km, rounded to the nearest half km (not down), and never more than 10 % over that longest run. A missed or shortened long run leaves the longest as it was, so the step repeats. Ceiling: 32 km or 3 hours at easy pace, whichever comes first. No setting for it, since the runner can edit the session.
2. **The threshold session, the next rung** (`NEXT.ladder`): 3×8 → 3×10 → 3×12 → 2×20, then over again with one rep more, 4×8 → 4×10, and the last rung repeats. At most 20 min a rep and 40 min at threshold a session. The rung comes from the last threshold session before the week that wasn't skipped or dropped (`nextRung`; a session off the ladder goes by its minutes at threshold). A skipped session means the same rung again. The volume decides how far it climbs (changed later the same day): time at threshold is at most 15 % of the week's km, never less than the first rung (3×8), so the session stays on 3×8 while the volume is built and climbs from about 45 km a week (3×10 at ~47 km, 3×12 at ~57, 2×20 at ~66, at 4:15/km). A second session goes first, then the main one steps down the ladder (`withinQuality`, `qualityCapKm`). This was 25 % of the week, which let the ladder climb at 28 km. The user's tip, from YouTubers and podcasts and no source of his own: "with three days a week run one easy, one threshold, one long; stay on the same threshold and build volume; then go to four days; build to the magic 40–60 km; then raise the intensity very slowly while more of the volume is at race pace". That matches Jack Daniels' *Running Formula*: at most 10 % of the weekly mileage at T pace in one session, and 3–4 weeks at a load before raising it. 10 % would be about 12 min at 28 km, too little for a session worth doing, hence 15 % with the 3×8 floor.
3. **Zone 2 fills the rest**, in halves, the last run taking what is left so the week adds up exactly. When there are too few km, an easy run is dropped, never the long run's step. No easy run is longer than the long run − 1 km. Strides on the first two, as before.
4. **One dial**, the form band at the end of the week:
   - *Too hard:* the threshold session a rung down, then fewer zone 2 km (−10 %, −20 %), then no threshold session. The long run keeps its step throughout.
   - *Too easy:* a faster finish on the long run, then a second threshold session, then other sports (45 min, never more than 2 h). Changed the same evening: form is judged as a share of fitness and a week above the band is "calm" and fine, so only the faster finish is tried ([form as a share of fitness](fartlek-form-relative.md)).

**The 30-day rule replaces the long-run share.** No session may be more than 10 % longer than the longest run of the 30 days before it. The 35 % share of the week (50 % / 42 % with two or three runs) is gone, and the share only remains as the long run's size when there is no run in the window to step from. The user first wanted 40 %, then "30 % isn't scientifically proven anyway", and chose the rule after this source: Frandsen et al., *How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study*, BJSM 2025 ([PMC12421110](https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/)). In 5 205 Garmin runners over 18 months, a single run more than 10 % over the longest of the past 30 days was linked to more overuse injuries (HRR 1.64 for 10–30 %), while weekly changes and ACWR were not. It is observational. The rounding is allowed: 11.5 km after a 10.4 km longest is fine ("so picky we don't need to be"), and the warning uses the same margin so it never flags the engine's own suggestion. Threshold sessions shorten their warm-up and cool-down to stay under it. The +10 %-a-week cap and the ramp stay as they were.

**Threshold warm-up and cool-down are 10 minutes** (2026-11-14), not 2 km and 1.5 km: the runner thinks in minutes there. One constant (`THRESHOLD_WARM_COOL_MIN` in `shared/steps.ts`) feeds the week and block engines, the quick-add and the "make one easy run a threshold session" tip. When the 30-day rule makes a session too long, the pair shortens in minutes (10/10, 10/8, 8/8, 8/5, 5/5). Sessions already saved keep their steps.

**Transparency.** The week dialog has one line on why: "Långpass 11 km: ditt längsta pass på 30 dagar (10 km) + 1 km · Tröskel 3x10 min (steg 2 av 6) · zon 2 fyller 12 km". Its ⓘ explains the rule with the week's max and links the study. The long-run tile shows "max X" and turns yellow over it, the warnings name the day, and each block week shows its long run and max with the same ⓘ.

**Lighter weeks.** Every fourth week: after three build weeks in a row (`lighterDue`: none empty or more than 15 % under the week before, and all at 90 % or more of the tolerated load, as in the block; weeks climbing back up to it are re-entry and don't count, added the same evening after the user's 10.9 → 20.2 → 23.3 km comeback got a lighter week), "Föreslå veckan" makes a lighter week, 70 % of the km, of the longest run and with a 3×6 threshold session. The ladder goes on afterwards from where it was (10 → 7 → 11 km), because the longest run of 30 days still holds the 10. A week noted "backoff" is lighter too. Blocks keep their own rule (3+ weeks end lighter). (Superseded 2026-11-16: the km rule `lighterDue` is gone; a lighter week now comes from heavy form or from asking, see [Skapa block](fartlek-skapa-block.md).)

**Intensity ceiling:** two threshold sessions, a faster long run finish and strides at most. The faster finish only in a week with one threshold session; a second threshold session only with five run days, so most runs stay easy (was four).

**The faster finish** (`tempoLong`): the last quarter of a long run of 8 km or more, 3–5 km. Far from a race it runs at threshold pace + 20 s/km (about marathon effort, a starting value to tune); within 16 weeks of an A race with a goal time at goal pace + 10 s/km. The user: "it's so long to my races, maybe better to just grind threshold? But you need to get the body used to race pace too".

**Few run days:** zone 2 goes first. With two days, the long run and the threshold session. With fewer than four run days and a week of 30 km or more, the dialog suggests another run day (the user's run days are a setting the engine doesn't change).

**Steps are saved on every run.** Saving a suggestion used to keep steps only on threshold sessions, so the strides on easy runs were lost; long runs with a faster finish need them too.

**A missed key session is caught at once, on Home** (built the same day, see [Idag](fartlek-today.md)). The user asked whether a missed long run changes the plan right away. It didn't: only a new suggestion did, and weeks already planned stayed as they were. Now:

- The rung counts only threshold sessions that were run (matched to an activity) or are still to run (`rungBefore`). Before, a missed session that wasn't struck counted as done, so the next suggestion went on to the next rung. The long run already went by what was actually run.
- The Idag card checks the next long run and the next threshold session in the coming 7 days (`keyFixes`). A long run more than 10 % over the longest run of the 30 days before it gets "Långpasset på söndag: 12 km → 11 km?", with an ⓘ on the study. A threshold session on the ladder that is ahead of the rung after the last one run gets "Tröskelpasset på tisdag: 3x12 min → 3x10 min?". Each has "Ändra till …" or "Behåll planen" (remembered in the browser). Long runs with steps and sessions off the ladder are left alone, since they are the runner's own.
- Spreading a struck session's km over the week ("Fördela om resten av veckan?") never takes a run past the 30-day rule.
- The plan's ▲ spike mark uses the engine's rounding to the half km, so it never flags a session the engine suggested.

**One engine for the week and the block** (later the same evening). The user: "can't we have the same engine for one week and a block? Otherwise it's better to remove Föreslå veckan and always use the block". The week button now gives exactly a block's first week:

- the same cap, with re-entry up to the load already handled (`weekCapWith`, was the block's `blockWeekCap`), so a comeback may grow more than +10 %, and the why line says so;
- the same judgement: the lowest form in the week as a share of fitness, with the km ramp ignored while the week stays within the tolerance;
- the same dial: too hard means fewer zone 2 km (−10 %, −20 %), and a calm week gets a faster finish on the long run. The week's own "a rung down" and "no threshold session" steps are gone; the threshold session fits itself to the smaller week;
- the same lighter week: due after three build weeks (none well under the week before, the last at least 5 % above the first, all at 90 % of the best of the 8 weeks before them, and 20 km or more). A block whose first week falls due starts with it (`lighterFirst`).

Weeks under 20 km also get a threshold session under the first rung (shorter reps, down to 2 × 5).

**Planning scenarios.** `apps/fartlek/src/server/scenarios.ts` puts real-looking histories (a return after a dip, steady, building, a comeback after a break, a beginner) into an in-memory database through the real app and runs both buttons on them. `npm run scenarios -w apps/fartlek` prints them, and `scenarios.test.ts` pins what they must give, including that the week equals the block's first week. This came from the user: "releasing ten times and sending screenshots doesn't work".

## Passed over

- A long-run cap of 40 % of the week, with or without conditions for a race: a rule of thumb, and the 30-day rule has a study behind it.
- Long-run steps in minutes: km is simpler to read, and the 3-hour ceiling covers slow runners.
- An advanced setting for the ceiling.
- Rebuilding the plan automatically after a missed session (Runna): offered on Home, never done behind the runner's back, as before.

## Open

- The longest run of 30 days counts any run, a race or a long threshold session included, so such a run lifts the next long run. In a planned block only long runs set the step.
- Two hard days in a row are avoided where the run days allow it, not forbidden.
