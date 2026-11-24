---
title: Fartlek gets a race-specific phase for the marathon and half, built from blueprints that scale per runner
summary: The last 8 weeks before an A-race marathon or half replace generic quality with race-pace sessions from a catalogue of blueprints in the repo, scaled to the runner; MP comes from today's prediction and is locked for the phase; the last build weeks may aim deep in the existing form band; real injury stops progression; no guard is loosened
type: decision
status: accepted
updated: 2026-11-24
---

# Fartlek gets a race-specific phase for the marathon and half, built from blueprints that scale per runner

Settled with the user on 2026-11-24. Built in six steps on 2026-11-24; the [build plan](#build-plan) below says how, and what was settled while building. It amends "no branches per distance" in [goal to plan](fartlek-goal-to-plan.md): the method stays one engine, but the last weeks before a long race now get race-pace sessions, because those sessions are what every marathon method has in common ([research](../research/marathon-specific-phase.md)). It answers the open pre-race phase in [block progression](fartlek-block-progression.md) and the distance-specific blocks left open in [race blocks](fartlek-race-blocks.md).

## Decided

- **When:** only before an **A race** of **marathon or half marathon**. A B race keeps today's handling. Other distances keep the generic engine.
- **Length:** the weeks inside **8 weeks of the race**. With today's `raceChunks` that is a 3:1 block followed by the form peak 2:2. A race added closer shortens the phase and keeps the block rhythm (7 weeks → 2:1 + 2:2). There was no peer-reviewed optimum to follow; coaches say 6–10 weeks, and 8 fits the 4-week blocks. The taper stays as built (two weeks, depth searched against race-day form), which matches Bosquet's two weeks at −41–60 % volume.
- **Race-specific first:** in the phase, the specific sessions take priority over everything else. Under about 60 km a week the threshold session is **replaced** by an MP/HMP session, so there are still two quality sessions a week (one of them the long run). At higher volume a threshold session may stay as a third.
- **Blueprints, not fixed sessions:** each key session is a blueprint in a file in the repo (not the admin panel), written in the existing step syntax with sizes as shares and progressions, plus what it requires (weekly km, long-run tolerance). The engine scales it to the runner's week, long run, pace and step in the phase. The file is versioned, diffed and tested like code.
- **First catalogue.** Marathon: long run with MP segments, progressive long run, long run with a fast finish, alternations (for example 3 km HMP / 3 km Z2), MP tempo, and a dress rehearsal (8–10 km at MP about 10 days out). Half: HMP repeats, HMP alternations, progressive long run, long run with a fast finish. Tune-up races are not generated; the runner adds them as B races.
- **Progression follows what was done, not the calendar.** A missed key session means next week takes the same step again; two key sessions are never stacked to catch up. Within 3 weeks of the race no long run is moved; a missed one is dropped. A phase that ends early just lands lower in the progression.
- **Long runs:** the ceiling stays at 32 km or 180 min, whichever comes first (`NEXT.longCeiling`), and the spike rule (10 % over the longest run in 30 days) stays. The phase plans one or two runs of 30–32 km, the last 3–5 weeks out, where the runner's tolerance allows. Fokkema 2020: a longest run under 25 km went with slower finishes, over 35 km brought nothing extra, and longer runs did not go with more injuries. Over a year the runner should pass 30–32 km a few times; that comes from normal building, not from the phase.
- **Never a refusal.** The engine always plans the phase, scaled to what the runner can do, and warns when the week is under about 40 km or the long run never reaches 25 km ("this goes with a slower finish").
- **Marathon pace from today's form, not the goal.** MP (and HMP) come from the race prediction (`predictRace`), which carries the least injury risk; Runna does the same and takes no goal time at all. MP is capped at 94 % of critical speed (Smyth & Muniz-Pumares 2020: going out above it predicted the biggest second-half slowdown). The cap applies to the prediction; when the runner explicitly picks a goal MP faster than the cap, their choice wins and the engine warns. When goal and prediction differ by more than 3 %, the engine **always asks** which to train for; it never switches by itself.
- **MP is locked when the phase starts.** Little fitness is built in 8 weeks, and a target that moves every week makes each MP session a moving goal. It is recalculated only after a B race inside the phase, and then the engine asks first.
- **The last build weeks may aim deep, inside the existing band.** In the two build weeks before the taper the engine aims at the deep end of the form band (−20 to −30 %) instead of only staying above the floor, so the taper has more to bring back. No guard changes: the floor, ramp caps, ACWR and spike rule stay. Aubry 2014 is why it stops there: acute fatigue without a drop in performance gave the biggest taper gain, while real overreaching blunted it. The engine backs off when the runner reports pain (level 5 or more within 7 days) or missed the paces of a key session: under half of the judged work reps in target in either of the last two tagged sessions.
- **Real injury, not daily form, stops the block.** Pain at level 8 or more, or level 5 or more on 3 different days within 7 days (the `READINESS.pain` limits Idag already uses), stops the phase's progression and offers a re-plan, which the runner chooses. A bad day never re-plans the block: daily form is for the day, not the month.

## Passed over

- **Admin-authored templates in the database.** One admin who deploys anyway gains little from an editing UI, and the blueprint language is needed either way.
- **Fixed sessions** ("15 km easy + 15 km MP"). They fit one runner; a blueprint is sized per runner.
- **Training at goal pace when it is faster than the prediction**, and switching to a faster prediction silently. An optimistic marathon prediction (about 7.7 % error) would put eight weeks of MP sessions too fast.
- **MP as a fixed share of threshold** (today's 88 % in the builder template) or "99 % of CS then 94 %". Recreational runners race at 79–93 % of CS depending on level, so the prediction is the better source and 94 % is only the cap.
- **3–4 runs over 32 km inside the phase.** At 50 km a week a 32 km run is two thirds of the week; the methods that do it (Pfitzinger) run 90+ km.
- **A peak mode that lifts the guards**, as already passed over in [race blocks](fartlek-race-blocks.md).

## Open

- The blueprint format (shares, steps, requirements) and its exact progressions are first guesses to tune on real histories (`npm run scenarios -w apps/fartlek`).
- The block and week planners read pain only through the injury stop (build plan step 5): readiness alone never changes a plan.

## Still missing around the phase (todo)

Noted on 2026-11-24 and not decided. The engine's year-round base (easy running, one threshold session, the long run, strides, 3:1 blocks) is sound for a runner at 40–70 km a week, but these gaps remain, most important first:

1. **Recovery after the race.** This is the biggest gap. After a marathon the engine only refuses block suggestions for 14 days (`afterRaceDays`). The rule of thumb is 2–4 easy weeks after a marathon and 1–2 after a half, then a gentle return. Without it the engine can build again too soon. Decided on 2026-11-24, with a build plan, in [post-race recovery](fartlek-post-race-recovery.md).
2. **The general build 16–8 weeks out.** Pfitzinger and Hansons run faster sessions there (VO2max, hills, 800–1000 m repeats) before marathon pace takes over. `intervals` exists as a workout type but is never generated. The effect for the marathon is moderate, but it gives variety and speed in reserve. It can use the same blueprints.
3. **The threshold ladder runs out.** It ends at 4×10 min, so after a few blocks the threshold session stops progressing. Longer continuous tempo runs (20–30 min, or 6–10 km) would keep it progressing over a longer time.
4. **A midweek medium-long run** (18–24 km). This is Pfitzinger's signature session, but it only matters from about 70 km a week. Lowest priority.

## Build plan

Drafted 2026-11-24 from the code at that date and built step by step. Line numbers drift, so search for the names. Paths are relative to `apps/fartlek/src`. Each PR runs `npm run check`, has a gitmoji commit message, and puts every UI string through `t()` in both `en` and `sv`. When a step is built, mark it here, and when all are built, mark the page built.

### Blueprint format

Blueprints are plain TS data in `shared/blueprints.ts` and compile to the existing `WorkoutSteps`. A text DSL would need a second parser, and the step syntax is already what the runner sees.

```ts
export type BlueprintId = "mp-long" | "progressive-long" | "fast-finish-long" | "mp-alternations" | "mp-tempo"
  | "dress-rehearsal" | "hmp-repeats" | "hmp-alternations" | "hmp-progressive-long" | "hmp-fast-finish-long";
export type PaceKey = "mp" | "hmp" | "steady" /* mp + 15 s */ | "mpFast" /* mp − 10 s */;
export type Off = "z2" | "jog" | "easy";
export type BpStep =
  | { kind: "block"; km: number; pace: PaceKey }
  | { kind: "reps"; times: number; onKm: number; off: Off; offKm?: number; offMin?: number; pace: PaceKey }
  | { kind: "finish"; segs: { km: number; pace: PaceKey }[] };
export interface Blueprint {
  id: BlueprintId; race: "marathon" | "half"; slot: "long" | "quality";
  type: "long" | "threshold";            // the SuggestType it is planned as
  layout?: "middle" | "end";             // long slot only
  steps: readonly BpStep[];              // the progression, index 0..n
  entryHigh: number;                     // first step when tolerated km >= 60 (else 0)
  caps: { workOfLong?: number; sessionOfWeek?: number; workOfWeek?: number };
  requires: { minWeekKm?: number; minLongKm?: number; minRunDays?: number };
  fallback: BlueprintId | null;          // when `requires` fails; null = a plain easy long run
  warmKm?: number; coolKm?: number;      // quality 2 / 1; mp-long cool 2
}
export function compileBlueprint(bp, step, c: { longKm?: number; weekKm: number; maxKm: number | null; paces: RacePaces }):
  { steps: WorkoutSteps; step: number } | null
```

**Long slot.** The total km still comes from `longRun` / `longFor`, so the 32 km / 180 min ceiling and the spike rule stay as they are.
- Work = `min(step km, workOfLong × long km)`, rounded down to the half kilometre.
- With `middle`: easy, then work, then a 2 km cooldown. With `end`: easy, then the segments.
- The easy part is never under 3 km; if it would be, the work shrinks.

**Quality slot.** 2 km easy, the work, 1 km easy.
- If the session breaks `sessionOfWeek`, `workOfWeek` or the day's max km, use the highest lower step that fits.
- If no step fits, scale step 0 down, but never under 3 km of work.
- The step returned is the one actually planned.

**Targets.** Paces compile to `{kind:"pace"}` and Z2 to zone 2. With no pace source at all, MP maps to zone 3 and HMP to zone 4.

### Catalogue (work km per step)

| id | slot | steps | entryHigh | caps / requires → fallback |
|---|---|---|---|---|
| mp-long (middle) | long | MP 8, 12, 16, 18, 20 | 1 | workOfLong 0.6; minLongKm 14 → fast-finish-long |
| progressive-long (end) | long | steady + MP 3+3, 4+4, 5+5, 6+6 | 1 | workOfLong 0.5 |
| fast-finish-long (end) | long | mpFast 3, 4, 5, 6, 8 | 1 | workOfLong 0.25 |
| mp-alternations | quality | HMP on / Z2 off 2×(2/2), 2×(3/3), 3×(2/2), 3×(3/3), 4×(3/3) | 1 | sessionOfWeek 0.3; minWeekKm 35 → mp-tempo |
| mp-tempo | quality | MP 1×6, 1×8, 2×5 (1 km easy), 1×10, 2×6, 1×12, 2×8 | 2 | workOfWeek 0.25 |
| dress-rehearsal | quality | MP 8 (under 60 km a week), 10 (60 or more); no progression | 1 | — |
| hmp-repeats | quality | HMP, 2 min jog: 3×2, 4×2, 3×3, 5×2, 4×3, 3×4, 2×6 | 2 | workOfWeek 0.2 |
| hmp-alternations | quality | HMP on / Z2 off 4×(1/1), 5×(1/1), 6×(1/1), 4×(2/1), 5×(2/1) | 1 | sessionOfWeek 0.3; minWeekKm 30 → hmp-repeats |
| hmp-progressive-long (end) | long | MP + HMP 2+2, 3+2, 3+3, 4+3, 4+4 | 1 | workOfLong 0.45 |
| hmp-fast-finish-long (end) | long | HMP 2, 3, 4, 5 | 1 | workOfLong 0.25 |

### Schedule

`PHASE_SCHEDULE[race][wip]` sets the blueprint for each slot. `wip = floor(days from week start to race / 7) + 1`, so the race week is W1. Roles follow `raceChunks`. A shorter phase uses the bottom rows.

| wip (role) | Marathon: long / quality | Half: long / quality |
|---|---|---|
| W8 build | progressive / mp-tempo | hmp-progressive / hmp-repeats |
| W7 build | mp-long / mp-alternations | hmp-fast-finish / hmp-alternations |
| W6 build | fast-finish (first 30–32 km chance) / mp-tempo | hmp-progressive / hmp-repeats |
| W5 lighter | easy long / mp-tempo held ×0.7 | easy / hmp-repeats held ×0.7 |
| W4 build, deep | fast-finish (second 30–32 km chance) / mp-alternations | hmp-fast-finish / hmp-alternations |
| W3 build, deep | mp-long (peak MP) / mp-tempo | hmp-progressive / hmp-repeats |
| W2 taper | easy long / dress-rehearsal on the run day nearest race − 10 (race − 13 to − 9) | easy / hmp-repeats held ×0.6 |
| W1 race | as today (the sharpener) | as today |

- **Under 60 km a week:** the long run and the quality slot are the only quality sessions, with no threshold ladder.
- **At 60 km or more:** build weeks with at least 5 run days keep the ladder rung as a third session, within `withinQuality`.
- **Long-run km** stays on the existing ladder, so 30–32 km runs come only where tolerance allows.
- **Warnings** (never a refusal), `phaseWarnings`:
  - `lowWeek`: a phase build week is under 40 km.
  - `shortLong`: the longest planned long run is under 25 km.

### State and data

**Migration** (`npm run db:generate -w apps/fartlek -- --name race_phase`; commit the SQL and `meta/`):
- `workouts.blueprint text`, a tag such as `"mp-long#2"`. A trailing `h` marks a held session in a lighter or taper week.
- `races.mp_sec`, `races.hmp_sec` (real), `races.pace_source`, `races.pace_locked_on` (text).

**No phase table.** The step for a blueprint is derived the way `rungBefore` derives the threshold rung:
- Take the last session with that tag before the week.
- `done`, `short`, `to_do` or `upcoming` gives step + 1, up to the last step.
- `missed`, `skipped` or `dropped` gives the same step again.
- A held session never advances.

Planned and done are linked by the existing `matchWeek` / `summarizeWeek` and `SessionView.outcome`. Within one plan, steps chain like `seed.rung + buildIdx`. Weeks are fixed slots, so nothing is ever stacked, and within 21 days of the race a missed long run is not replayed.

### Marathon pace

Pure function in `shared/racephase.ts`:

```ts
racePace({ distanceKm, predMp, predHmp, csMps, goalSeconds, thresholdPace }) → { mp, hmp, source, ask, overCap }
```

- **Prediction:** `predictRace` for 42.195 and 21.0975 km. CS and the curve come the way `racePrediction` gets them in `server/performance.ts` (`chooseCs(autoCriticalSpeed(...))`, `bestCurve` over 84 days).
- **Cap:** a predicted MP is held to 94 % of CS at most (`source: "capped"`). HMP is not capped. A goal MP the runner explicitly chose wins over the cap and sets `overCap` for a warning.
- **Ask:** when the goal pace and the prediction differ by more than 3 %.
- **Fallbacks, in order:**
  1. Goal pace (source `goal`), with the other distance from Riegel.
  2. Threshold: MP = thr / 0.9, HMP = thr / 0.96 (the inverse of `neededThreshold`).
  3. `none`, which uses zone targets.

  The UI always says which source was used.
- **Lock:** `POST /api/races/:id/race-pace {choice: "prediction" | "goal" | "keep"}`.
  - GETs plan with the locked pace, or with the proposal when nothing is locked.
  - A POST that writes phase weeks locks the proposal itself when nothing is pending.
  - When a question is pending it returns 409 `racePace`, and `client/suggestblock.tsx` / `suggestweek.tsx` show the choice first.
- **Recalculation:** a B race with a result after `pace_locked_on` gives a proposal (current against new). `keep` re-stamps the date.

### PRs

1. **Catalogue and compiler.** *Built.* `compileBlueprint` also takes an optional `runDays`, and `meetsRequires` / `entryStep` are exported for PR 2 and 4.
   - Add `shared/blueprints.ts`, `PHASE_SCHEDULE`, and in `shared/racephase.ts`:
     ```ts
     RACE_PHASE = { weeks: 8, highKm: 60, warn: { weekKm: 40, longKm: 25 }, mpCapOfCs: 0.94, askPct: 0.03,
       noMoveDays: 21, deepAim: -25, paceMissShare: 0.5, injury: { level: 8, repeatLevel: 5, repeatDays: 3, windowDays: 7 } }
     ```
   - Done when `blueprints.test.ts` checks:
     - ids are unique and `entryHigh` is inside the steps;
     - schedule ids match their race and slot;
     - mp-long at L = 26, step 2, gives 15.5 km MP after 8.5 km easy;
     - mp-alternations at 40 km a week steps down to a session of 12 km or less;
     - every compiled session round-trips through `stepsText` / `parseSteps`;
     - no pace source gives zone targets.
2. **Data and tag plumbing.** *Built.* The tag helpers `blueprintTag` / `parseBlueprintTag` live in `shared/blueprints.ts` next to `stepFor`; migration `0024_race_phase`.
   - Files: schema and migration; `Workout.blueprint` and the `Race` pace fields in `shared/types.ts`; `toWorkout` in `server/repo.ts`; `SuggestItem.blueprint`; `parseItems`, `insertItems` and `restoreRows` in `server/routes/nextweek.ts` (validate against known ids); `workoutWeeks` in `shared/planrange.ts`; the copy path in `server/routes/plan.ts`.
   - `rungBefore` must ignore tagged workouts, or MP sessions reset the threshold ladder.
   - Add `stepFor(sessions, id, before, entry)`.
   - Done when tests cover done → +1, missed → same, held → same and the ignored rung, and an `app.test.ts` round-trip keeps the tag.
3. **Marathon pace and lock.** *Built.* `racePace` also takes the runner's `choice` (`prediction` or `goal`), since the cap and the 3 % question depend on it. The next A race is the one that counts: when it is not a marathon or half there is no phase. A pace with source `none` is never locked.
   - Add `racePace`, `server/racephase.ts` with `phaseRace(ctx, weekStart)` and `racePaceProposal`, the route, and the client choice card.
   - `phaseRace` finds the next A race within 1 km of 42.195 or 21.0975 with wip ≤ 8.
   - Done when there are tests for the cap, the runner's own choice over the cap, the 3 % question, each fallback and the recalculation after a B race.
4. **Planner wiring.** *Built.* Settled with the user while building: the dress rehearsal sits in the week that holds its day (race − 13 to − 9), which is W3 for a race on Monday–Wednesday (it then replaces W3's quality session and W2 has none). A held session is only held in a lighter or taper week (the schedule's `held` is dropped in a build week, so a phase shorter than 8 weeks gets a full session there). When the day or week can't hold a blueprint or its fallback, the week keeps the plain threshold session. `PhaseSeed.backOff` and `injury` are in place but always false until steps 5 and 6. The block editor shows `phaseWarnings`.
   - Add `PhaseSeed { race, paces, paceSource, steps, backOff, injury }` on `WeekSeed` (via `seedFor` / `keySessionSeed`), on `BlockSeed` and in `weekAsBlock`.
   - In `weeksFor` (`shared/blockplan.ts`), phase weeks use the schedule: the ladder goes (or stays as a third session per the rule above) and tempo turns off.
   - `build` (`shared/nextweek.ts`) gains `Shape.phase` with the long run and the quality sessions, placed before the threshold, typed `threshold` and tagged.
   - `server/scenarios.ts` gains race distance and goal, and three scenarios: a marathon in 8 weeks at 45 km, a marathon in 8 at 70 km, a half in 6.
   - Done when:
     - each build week under 60 km has exactly one long and one tagged quality session, and a third ladder session appears at 70 km;
     - the dress rehearsal falls 9–13 days out;
     - no long run passes 32 km / 180 min or the spike limit;
     - the warnings show at 35 km;
     - race-day form lands in `COACH.race`;
     - the scenarios output has been reviewed.
5. **Injury stop.** *Built.* Held means the blueprint stays at the step it is at and is tagged `h`, at full size (a lighter week's scaling is separate). The offer is a card on the Blocks page, shown only while a phase is on; its button opens the existing lighter re-plan of the running block. `PhaseSeed.injury` is set from the same check.
   - Add `injuryStop(pain, today)` in `shared/recovery.ts`. It fires on pain of level 8 or more in the last 7 days, or of level 5 or more on 3 different days within 7.
   - `server/racephase.ts` reads `repo.listPain`. When it fires, every step is held and the deep aim is off.
   - GETs return `injury`, and the client offers the existing re-plan (`/blocks/:id/replan?light=1`). The runner chooses; readiness alone never re-plans.
   - Done when there are tests at both limits, and a test that nothing but the held steps changes.
6. **Deep aim in the last two build weeks.** *Built.* The deep aim only runs with a phase (an A marathon or half). `PhaseSeed.backOff` is set from pain of level 5 or more in the last 7 days, or from under half of the judged work reps in target in either of the last two run tagged sessions (`backOffNow`). When the taper can't land race-day form in `COACH.race` on the deeper weeks, the plain weeks stay. The page is built.
   - In `suggestBlock`, before `taperFit`: for the two build weeks right before the first taper week, when there is no back-off or injury, bisect km between the planned km and the week's cap for the largest km whose deepest form is −25 % or higher and is not too hard. Add the try id `"deep"`.
   - Revert if race-day form then leaves `COACH.race`.
   - Leave `COACH.floor`, `rampRisk`, `weekGrowth`, `floorFor`, `fitWeeks` and the spike rule untouched.
   - Back off when:
     - there is pain of level 5 or more within 7 days; or
     - in either of the last two tagged sessions, under half of the judged work reps were in target (`stepSummary` via `stepMatchFor` in `server/analysis.ts`).
   - Done when tests show the deep weeks stay within the cap, a calm runner gets deeper, and pain or missed paces turn it off.
   - Then mark this page built and run `npm run docs:index`.
