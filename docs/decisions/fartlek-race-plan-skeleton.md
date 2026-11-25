---
title: Fartlek plans the whole road to an A marathon or half as a skeleton of phases, with sessions one block at a time
summary: An A marathon or half up to 30 (half 20) weeks out gets a race plan, a skeleton of typed weeks (base, build, specific, taper, race, recovery) with a km target for every week to the end of post-race recovery; sessions are still made for the next block only; phase lengths are a function of the weeks to the race; skeleton targets live in their own table and never count as tolerance; built 2026-11-24 from the step-by-step build plan
type: decision
status: accepted
updated: 2026-11-24
---

# Fartlek plans the whole road to an A marathon or half as a skeleton of phases, with sessions one block at a time

Settled with the user on 2026-11-24, as a spec for a build session. It decides item 3 of [Mål till plan](fartlek-goal-to-plan.md) ("the whole road as a preview: phases with km, the first block with real sessions") and the multi-block plan left open in [post-race recovery](fartlek-post-race-recovery.md). It partly supersedes "no extra cycle level above blocks" in [runplan training blocks](runplan-training-blocks.md): for an A marathon or half there is now a plan above the blocks, but blocks stay the unit sessions are made in, so "blocks you can follow up, not one long plan" in [race blocks](fartlek-race-blocks.md) still holds. The [build plan](#build-plan) below was written so the work could be done without re-deriving anything. **Built 2026-11-24**; what changed while building is under [Built](#built).

## Decided

1. **A skeleton, and one block of sessions at a time.** For the next A race that is a marathon or a half, the plan is a sequence of typed weeks from the next block's first week to the end of the race's recovery weeks. Every week has a phase (`base`, `build`, `specific`, `taper`, `race`, `recovery`), a role (`build`, `lighter`, `taper`, `race`, `recovery`) and a **km target**. Sessions are generated only for the next block (up to 4 weeks, within 8 weeks of the race the two last blocks together, as today). The skeleton is a cheap projection, never a set of sessions.
2. **Skeleton targets have their own table** (`race_plan_weeks`), never `week_targets`. When a block is created or re-planned, its weeks' `week_targets` are **deleted and inserted again** from the block's computed weeks in the same transaction, and the skeleton weeks after the block are recomputed and replaced in that transaction too. A skeleton week becomes a block week by having its km set to null; from then on its target is the block's. The UI shows skeleton weeks dashed with "~km", block weeks solid.
3. **Phase lengths by weeks to the race; extra time goes into base.** The engine's taper stays 2 weeks (taper week + race week) and the 2:2 form peak, 3:1 rhythm and race-specific phase logic stay as they are. Phase lengths are a function of the weeks to the race (see [phase lengths](#phase-lengths)); the template the user set: marathon 12 → 2/4/4/2 (base/build/specific/taper), 16 → 4/6/4/2, 20 → 8/6/4/2, 28 → 12/8/6/2; half 8 → 1/3/2/2, 12 → 3/4/3/2, 16 → 5/5/4/2. Cutbacks stay 3:1, counted back from the race by `raceChunks`.
4. **The taper stays 2 weeks for now.** Marathon tapers in the books are often 3 weeks (Pfitzinger 3, Higdon 3, Hansons about 10 days); see [open](#open).
5. **Too little time warns and lowers the goal, never refuses.** Under 12 weeks for a marathon or 8 for a half the plan says so, offers today's prediction as the goal time, and compresses: base first, then build; the specific phase keeps its minimum (marathon 4, half 2) while the weeks allow it, the taper always.
6. **Falling behind:** the race date is fixed. A miss of up to about a week is absorbed: the plan continues as written and runs are never made up. A break of 8 days or more makes the next block's first week at most 70 % of what the skeleton had for it. The skeleton is recomputed from **actual** training each time a block is generated, and planned weeks (skeleton or block) never count as proven tolerance in that computation.
7. **No invented tune-up races.** The engine knows only races the runner entered. B races (and other A races) inside the plan are honoured: a race week (mini-taper) and the B recovery rows from [post-race recovery](fartlek-post-race-recovery.md). The key long runs (towards 32 km for the marathon) are placed so the long-run peak is reached 8 to 5 weeks before the race and then held, never raised, in the weeks after.
8. **Race window: 30 weeks for a marathon, 20 for a half.** Other distances and B races keep `BLOCK.raceWindowWeeks` (16). Further out, ordinary blocks; the dialog says when the plan starts.
9. **Recovery at the end reuses the `recovery` role** and `RECOVERY` table of [post-race recovery](fartlek-post-race-recovery.md); the plan ends after it, then normal blocks.

## Why

- **The whole road answers "am I on track for the race"**; one block at a time answers "what do I run". Runna and the books show the whole road; Fartlek keeps sessions one block at a time because a long plan made of sessions is wrong after the first missed week, and the adaptive engine re-plans from what was run.
- **Phases follow the classic structure.** Pfitzinger (18- and 12-week plans in mesocycles: endurance, lactate threshold, race preparation, taper), Daniels (four phases, and phase I, the base, is the one to shorten when time is short), Canova (general, then special, then specific), Lydiard (base, hills, sharpening, freshening), Hansons and Higdon all build general to specific and taper. They agree that extra time goes into general base, not into a longer specific phase.
- **Minimum and ideal lengths.** Coaches give about 12 weeks as the minimum marathon build for an experienced runner and 16–18 as ideal; for the half about 8 as the minimum and 10–12 as ideal.
- **Missed training.** The common rules: under about 7 days off, resume the plan; 7–14 days, the first week back at about 70 %; more than 2 weeks, cut from the middle of the plan; never cut the taper; never make up missed runs.
- **3:1 cutbacks with 15–25 % less volume** are the usual rhythm; the engine's lighter week (70 %) and `raceChunks` already give it.
- **Caveat.** The numbers are coarse, and several come from secondhand summaries of the books, not the full texts. Tune them with `npm run scenarios -w apps/fartlek` once built.

## Passed over

- **Sessions for the whole road.** Wrong after the first missed week, slow to compute (`fitWeeks` and the taper search run per block), and against "blocks you can follow up".
- **Skeleton targets in `week_targets` with a source column.** `week_targets` has one row per week (`PRIMARY KEY (user_id, week_start)`) and is read as the runner's own target in several places: `seedFor` turns it into a fixed week (`targetKm` → `fixedKm`), `weekSummaries` judges compliance against it, and the re-plan reads its `backoff` note. A skeleton row there would be taken for a decision the runner made. A separate table keeps every existing reader unchanged.
- **A plan table plus a weeks table.** One weeks table with the race id on every row is enough: the plan's start is its first row, one plan is active at a time, and nothing else about it needs storing.
- **A longer specific phase when there is more time.** The sources put extra time into base.
- **Refusing a plan that is too short.** The runner has entered the race; the useful answer is what is realistic.
- **Generating tune-up races.** The runner decides which races to run; a race in the calendar the runner didn't choose breaks "never lock anything in".

## Open

- **Research whether the marathon taper should be 3 weeks** (todo). Pfitzinger and Higdon taper 3 weeks, Hansons about 10 days, Bosquet 2007 found 8–14 days best across sports. No change now; if it changes, `TAPER_WEEKS`, `raceChunks` (the peak block would be 1:3 or 2:3), `RACE_PLAN.taperWeeks` and the `PHASE_SCHEDULE` rows move together.
- **The specific phase and the race-specific phase window differ for marathon plans of 12–23 weeks.** The skeleton's `specific` phase is 4 weeks there (the template), but `RACE_PHASE.weeks` (8, so 6 weeks before the taper) puts race-pace blueprints in the last two `build` weeks as well. Kept on purpose (the decision says the race phase stays as it is); the road marks where race pace starts. Whether the two should be one number is open.
- **Base and build differ only in name and block kind** in v1: the same engine makes their sessions. The general build with faster sessions (todo 2 in [race-specific phase](fartlek-race-specific-phase.md)) would give `build` its own content.
- **Fitness on race day for the whole road.** The skeleton has km, not sessions, so the fitness projection still ends where the planned sessions end (`planEnd`, capped at 200 days). A km-to-load estimate could extend it later.
- **The phase-length rule** (anchors, steps of 4 weeks) gives a base one week shorter at 24, 28 (marathon) and 12, 16 (half) than at the week before, because specific and build grow there. Harmless; tune once scenarios run.

## Phase lengths

Counted from the race back: the taper (2 weeks, the race week included), the specific phase, the build phase, and base gets the rest. Specific and build grow by one week every 4 weeks over an anchor, within a range.

| | anchor | specific | build | base at least | minimum weeks | ideal |
|---|---|---|---|---|---|---|
| Marathon | 20 | 4–6 | 6–8 | 2 | 12 | 16–18 |
| Half | 8 | 2–4 | 3–5 | 1 | 8 | 10–12 |

For `n` weeks to the race (race week included), `step = floor((n − anchor) / 4)`:

- `specific = clamp(specific.min + step, specific.min, specific.max)`
- `build = min(clamp(build.min + step, build.min, build.max), n − 2 − specific − baseMin)`
- `base = n − 2 − specific − build`

Under the minimum weeks, start from the lengths at the minimum and take the missing weeks from base, then build, then (only when the weeks can't hold it) specific, and from the taper only when `n` is 1. All values, base/build/specific/taper:

- **Marathon:** 1: 0/0/0/1 · 2: 0/0/0/2 · 3: 0/0/1/2 · 4: 0/0/2/2 · 5: 0/0/3/2 · 6: 0/0/4/2 · 7: 0/1/4/2 · 8: 0/2/4/2 · 9: 0/3/4/2 · 10: 0/4/4/2 · 11: 1/4/4/2 · 12: 2/4/4/2 · 13: 2/5/4/2 · 14: 2/6/4/2 · 15: 3/6/4/2 · 16: 4/6/4/2 · 17: 5/6/4/2 · 18: 6/6/4/2 · 19: 7/6/4/2 · 20: 8/6/4/2 · 21: 9/6/4/2 · 22: 10/6/4/2 · 23: 11/6/4/2 · 24: 10/7/5/2 · 25: 11/7/5/2 · 26: 12/7/5/2 · 27: 13/7/5/2 · 28: 12/8/6/2 · 29: 13/8/6/2 · 30: 14/8/6/2
- **Half:** 1: 0/0/0/1 · 2: 0/0/0/2 · 3: 0/0/1/2 · 4: 0/0/2/2 · 5: 0/1/2/2 · 6: 0/2/2/2 · 7: 0/3/2/2 · 8: 1/3/2/2 · 9: 2/3/2/2 · 10: 3/3/2/2 · 11: 4/3/2/2 · 12: 3/4/3/2 · 13: 4/4/3/2 · 14: 5/4/3/2 · 15: 6/4/3/2 · 16: 5/5/4/2 · 17: 6/5/4/2 · 18: 7/5/4/2 · 19: 8/5/4/2 · 20: 9/5/4/2

**How the phases sit with the blocks.** Phases are labels on weeks; the weeks' **roles** still come from `raceChunks(n)` (the peak block 2:2 at the end, 3:1 blocks before it, a shorter in-phase block at the front), so the lighter weeks fall at 5, 9, 13 … weeks to the race whatever the phases are, and `PHASE_SCHEDULE`'s W5 lighter row stays right. The taper phase is the taper week (wip 2), the race phase the race week (wip 1). A block (a chunk) is saved with the **kind of the phase most of its weeks have**, a tie going to the later phase, with taper and race counting as `specific`; so `BLOCK_KINDS` needs no new value. Worked chunk kinds: marathon 12 → build, specific, specific; 16 → base, build, specific, specific; 20 → base, base, build, specific, specific; 28 → base ×3, build ×2, specific ×2; 30 → a 2-week base block, then base ×3, build ×2, specific ×2. Half 8 → build, specific; 12 → base, build, specific; 16 → base, build, specific, specific.

**Fixed at the plan's start.** The lengths come from `n` at the plan's first week (`planStart`, the first stored row), not from the weeks left at each block, so a plan started 28 weeks out keeps its 6-week specific phase. Because every phase is counted back from the race, time lost to a break falls on the phase it happens in: a break in base shortens base, one in build shortens build, and the taper and specific phase are never moved earlier or shortened by the plan. The km lost are never made up (the skeleton is recomputed from what was run).

## Built

Built on 2026-11-24, steps 1–9 except the optional ghost bands in `pages/Blocks.tsx`. What was settled or changed while building:

- **The golden projection holds exactly.** The prototype's numbers in test 7 (every week's role, km and long run, `peakKm` 62.5, `longPeak` at wip 6) came out of the real code unchanged.
- **Test 11's "B race at wip 3" became two cases.** In the 2:2 peak block wip 3 is a build week, not a taper week, so a race there gets a race week (honoured, `close`). The rule that a taper week keeps its role and km is tested with a race in the taper week (wip 2): the whole skeleton is then unchanged.
- **Strings are `road.*`, not `rp.*`.** `rp.title`, `rp.button` and `rp.banner` already belong to the re-plan dialog ("Räkna om resten"); the keys are otherwise as in the table.
- **`GET /plan` carries `skeleton`.** There is no `GET /plan/weeks`; the calendar's own route got the map, and the week header shows the dashed `road.weekTarget` chip when the week has no target.
- **Undo of a block now restores the targets it replaced.** `targetsBefore` was sent without each target's week, so undo refused it whenever one of the block's weeks already had a target. The POST now returns `{ weekStart, km, minutes, note }`; step 5.1 (delete, then insert) relies on it.
- **Overlapping recovery of other races:** a chunk's seed holds one recovery race, so the one whose recovery reaches furthest decides, instead of a per-week merge of the lower share. Recovery never replaces the plan race's taper or race week.
- **Other races before the plan** (up to `RECOVERY.lookbackDays` before `planStart`) feed the projection's recovery weeks but are not listed on the road (`road.other` is for races inside the plan).
- **Back after a break.** In the pure projection the cap is `RACE_PLAN.back.share × anchorKm` (the input has no stored km). In "Skapa block" it is applied only when a plan race decides the weeks, from the stored skeleton km of the start week, else the tolerance.
- **Signatures:** `writePlan(tx, userId, fromWeek, rows, computedOn)` (each row carries its `raceId`); `roadFor` also takes `planStart` and the other races. `planRows`, `activePlanRace`, `otherRacesInBlock` and `phaseAtFor` are small helpers in `server/raceplan.ts`.
- **Scenarios** ("marathon in 20", "marathon in 28", "half in 12", "marathon in 10"): phase lengths and the long-run peak (wip 6) as decided. Two things to tune later: at 20 weeks from a 17 km long run the ladder tops out at 24 km, so `longShort` is shown; at 28 weeks the careful cap compounds from 45 to about 85 km a week, a steep road for a 45 km runner (each block is still capped by what was actually run when it is made). Both settled on 2026-11-25 in [long-run ceiling](fartlek-long-run-ceiling.md): 40 % of the week for the long run in a marathon plan, and a km cap per race.

## Build plan

Drafted 2026-11-24 from the code at that date, kept as the record of what was built (see [Built](#built) for what changed). Paths are relative to `apps/fartlek/src`.

**Prerequisite:** the [post-race recovery](fartlek-post-race-recovery.md) build plan (the `recovery` role, `RECOVERY`, `recoveryRow`, `recoveryRoles`, `withRecovery`, `recoveryRaceFor`, the `recovery` branch in `volumes()`). Build it first; this plan only calls it.

### Step 1: the pure plan (`shared/raceplan.ts`, new)

Imports: `addDays`, `daysBetween`, `type ISODate` from `./dates`; `raceChunks`, `projectVolumes`, `type BlockSeed`, `type Tolerance`, `type WeekRole`, `RECOVERY`, `recoveryRow` from `./blockplan`; `longFor`, `longRun`, `NEXT` from `./nextweek`; `TAPER_WEEKS` from `./blocks`; `RACE_PHASE` from `./racephase`; `HALF_M`, `MARATHON_M` from `./racemodels`; `type BlockKind` from `./types`. It must **not** call `suggestBlock`, `weeksFor`, `evaluateBlock` or `fitWeeks` (see [performance](#performance)).

```ts
export type RaceKind = "marathon" | "half";
export type PlanPhase = "base" | "build" | "specific" | "taper" | "race" | "recovery";

/** The race plan (docs/decisions/fartlek-race-plan-skeleton.md). Not in TUNE: the window and minimums are structure, the long-run hold an injury guard. */
export const RACE_PLAN = {
  /** An A race of this kind this many weeks away (race week included) or closer gets a plan. */
  windowWeeks: { marathon: 30, half: 20 } as Record<RaceKind, number>,
  taperWeeks: TAPER_WEEKS, // 2: the taper week and the race week
  phases: {
    marathon: { anchor: 20, specific: [4, 6], build: [6, 8], baseMin: 2, minWeeks: 12, ideal: [16, 18] },
    half:     { anchor: 8,  specific: [2, 4], build: [3, 5], baseMin: 1, minWeeks: 8,  ideal: [10, 12] },
  },
  /** The long run reaches its peak by `by` weeks to the race (wip) and is held, not raised, in build weeks from `holdFrom` to `holdTo`. */
  longPeak: { marathon: { by: 6, holdFrom: 5, holdTo: 3 }, half: { by: 4, holdFrom: 3, holdTo: 3 } } as Record<RaceKind, { by: number; holdFrom: number; holdTo: number }>,
  /** Days in a row without a run: up to `absorbDays` nothing changes; more makes the first week back at most `share` of the plan. */
  back: { absorbDays: 7, share: 0.7 },
} as const;

/** Marathon or half within 1 km; null for any other distance. Moved here from `kindOf` in server/racephase.ts (which then imports it). */
export const raceKindOf = (km: number): RaceKind | null =>
  Math.abs(km - MARATHON_M / 1000) <= 1 ? "marathon" : Math.abs(km - HALF_M / 1000) <= 1 ? "half" : null;

/** Weeks to the race from `weekStart`, the race week being 1 (the same count as `racePlanFor` and `phaseRace`'s wip). After the race: 0, −1, … */
export const wipOf = (weekStart: ISODate, raceDate: ISODate) => Math.floor(daysBetween(weekStart, raceDate) / 7) + 1;

export interface PhaseLengths { base: number; build: number; specific: number; taper: number }
export function phaseLengths(weeks: number, kind: RaceKind): PhaseLengths; // the rule in "Phase lengths" above
/** One phase per week, front to race: base…, build…, specific…, then "taper" × (taper − 1) and "race". */
export function phaseOfWeeks(l: PhaseLengths): PlanPhase[];
/** The block kind of a chunk: the phase most of its weeks have, a tie to the later one; taper and race count as specific, recovery as recovery. */
export function chunkKind(phases: PlanPhase[]): BlockKind;
```

`phaseLengths`, written out:

```ts
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
function lengthsAt(n: number, p: (typeof RACE_PLAN.phases)[RaceKind]): PhaseLengths {
  const T = RACE_PLAN.taperWeeks, step = Math.floor((n - p.anchor) / 4);
  const specific = clamp(p.specific[0] + step, p.specific[0], p.specific[1]);
  const build = Math.min(clamp(p.build[0] + step, p.build[0], p.build[1]), n - T - specific - p.baseMin);
  return { base: n - T - specific - build, build, specific, taper: T };
}
export function phaseLengths(n: number, kind: RaceKind): PhaseLengths {
  const p = RACE_PLAN.phases[kind];
  if (n >= p.minWeeks) return lengthsAt(n, p);
  const r = lengthsAt(p.minWeeks, p);
  let cut = p.minWeeks - n;
  for (const k of ["base", "build", "specific"] as const) { const c = Math.min(cut, r[k]); r[k] -= c; cut -= c; }
  r.taper -= cut; // only when n is 1
  return r;
}
```

`chunkKind`: count with `taper`/`race` → `specific`; rank `base < build < specific < recovery`; return the highest count, ties to the higher rank.

**Other races inside the plan** (B races, and A races that are not the plan's race):

```ts
export interface OtherRace { date: ISODate; distanceKm: number; name: string }
/**
 * Every other race the runner entered between the plan start and the plan race is honoured; the engine never drops one.
 * `close` lists those inside the plan race's peak block or taper (wip <= 4 of the plan race): still planned as races,
 * but the UI warns (`rp.otherClose`). Several in one chunk are all honoured.
 */
export function otherRacesIn(others: OtherRace[], raceDate: ISODate, chunkStarts: ISODate[]): { honoured: OtherRace[]; close: OtherRace[] };
```

The runner decides which races to run, not the engine. Rules when other races collide with the plan:

- A week holding an other race gets role `race` (B race-week km), unless it is a plan-race `taper` or `race` week: then the week keeps its taper role and km, and only the race day itself becomes the race session.
- Recovery weeks after an other race never replace the plan race's `taper` or `race` weeks; where they overlap, the taper role wins. Elsewhere, two recovery spans that overlap merge into the longer one (per week the lower km share).
- Two other races in one week: one `race` week; recovery from the longer race.

**The projection:**

```ts
export interface SkeletonInput {
  kind: RaceKind;
  race: { date: ISODate; distanceKm: number };
  /** The plan's first week (stored, or the first week projected when there is no plan yet): fixes the phase lengths. */
  planStart: ISODate;
  /** The first week to project: the week after the block just generated, or the next open week. Always >= planStart. */
  firstWeek: ISODate;
  /** Run km of the 3 weeks before `firstWeek`, oldest first: actual where past, the block's planned km where ahead. */
  window: number[];
  /** Proven tolerance from actual run km only (see step 3). */
  tolerance: Tolerance;
  /** The top build week before `firstWeek` (the block just generated), else tolerance.km: where the next chunk's ramp starts. */
  anchorKm: number;
  /** The biggest build week planned or run since planStart (the taper and recovery reference); 0 = none yet. */
  peakKm: number;
  /** The longest run of the 30 days before `firstWeek` (actual, and the generated block's planned runs): the long-run ladder's start. */
  longestKm: number;
  easyPace: number | null;
  /** Honoured other races (from `otherRacesIn`). */
  others: OtherRace[];
  /** Days off before the block (step 3, `breakBefore`); > RACE_PLAN.back.absorbDays caps the first projected build week. */
  backDays?: number;
}
export interface SkeletonWeek { weekStart: ISODate; wip: number; phase: PlanPhase; role: WeekRole; km: number; longKm: number | null; chunk: number }
export interface Skeleton { lengths: PhaseLengths; weeks: SkeletonWeek[]; peakKm: number; longPeak: { weekStart: ISODate; km: number; wip: number } | null }
export function projectSkeleton(input: SkeletonInput): Skeleton;
```

Algorithm, in order:

1. `n0 = wipOf(planStart, race.date)`; `phases = phaseOfWeeks(phaseLengths(n0, kind))` (index 0 = planStart). `n = wipOf(firstWeek, race.date)`; `chunks = raceChunks(n)` (anchored at the race, so their edges agree with `raceChunks(n0)`). If `n < 1` the race is over: return only the recovery weeks (6.).
2. Walk the chunks from `firstWeek`. For each chunk with start `cs`, length `c.weeks` and roles `c.roles`:
   - Other races in it (`others.filter((o) => o.date >= cs && o.date <= addDays(cs, c.weeks * 7 - 1))`, all of them): each one's week becomes `"race"` unless it is a plan-race `taper`/`race` week (then the role stays; see the collision rules above); the plan race keeps priority A only in its own week (step 2).
   - Recovery after each honoured other race (in this chunk, or before `cs` with recovery reaching into it; overlaps merged per the collision rules, never over `taper`/`race` weeks): `roles = withRecovery(roles, recoveryRoles({ date: o.date, distanceKm: o.distanceKm, priority: "B", peakKm: null }, cs, c.weeks))`, and the same race as the seed's `recovery`. A race under 10 km gives no recovery weeks (`recoveryRow` is null).
   - Build a seed with only the fields `volumes()` reads: `{ startWeek: cs, weeks: c.weeks, kmBefore: win.slice(-3), tolerance, roles, anchorKm: anchor, firstWeekMax: null, race: holdsPlanRace ? { date: race.date, priority: "A" } : otherInChunk ? { date: o.date, priority: "B" } : null, recovery: thatOtherRace ? { date, distanceKm, priority: "B", peakKm: null } : null, backKm: first chunk && backDays > absorbDays ? floorHalf(RACE_PLAN.back.share * (storedKm ?? anchor)) : null }` plus zero/default values for the rest (`ctl: 0, atl: 0, past: [], runDays: [], longRunDay: 0, threshold: null, refs: {} as StepRefs, crossMin: 0, lighterLast: false, goalKm: null, buildWeeksDone: 0, hardBefore: false, longestKm, rung: 0, tempoPace: null`). Taper depth: none set, so `TUNE.taper` shares (the search runs only when the peak block is generated).
   - `vols = projectVolumes(seed)`; for each week `i` push `{ weekStart, wip, phase: phases[index of weekStart from planStart], role: vols[i].role, km: vols[i].km, longKm, chunk }`; `win.push(km)`.
   - After the chunk: `anchor = Math.max(anchor, ...build kms of the chunk)`; `peak = Math.max(peak, ...build kms)`.
3. **The anchor is not tolerance.** It only moves where the next chunk's ramp aims (`TUNE.ramp` × anchor); every cap still comes from `blockWeekCap(window, tolerance.km)` with the **actual** tolerance, so re-entry (+30 %) never reaches above what was run, and above it the careful cap (+10 % on the growth base, ramp 1.3) holds. This is how real blocks progress when each is made after the one before was run.
4. **Long run per week** (mirrors `weeksFor`, without sessions). Start `longest = longestKm`. For each week:
   - `role === "race"`: `longKm = null`.
   - `role === "recovery"`: `longKm = Math.max(NEXT.easyMinKm, Math.min(RECOVERY.longMaxKm, floorHalf(km * RECOVERY.longShare)))`.
   - else: `lighter = role !== "build"`; `lp = longRun(longest, lighter, easyPace)`; `longKm = lp ? longFor(lp.km, km, longest, lighter) : floorHalf(km * NEXT.longShare)`. **Hold:** when `role === "build"` and `holdTo <= wip <= holdFrom` (`RACE_PLAN.longPeak[kind]`), `longKm = Math.min(longKm, longest)`. Then `longest = Math.max(longest, longKm)`.
5. `longPeak`: the first week whose `longKm` equals the maximum `longKm` of the weeks with `wip >= 2`; null without long runs.
6. **Recovery weeks after the plan race:** `row = recoveryRow({ distanceKm: race.distanceKm, priority: "A" })`; for `k` in `0 .. row.weeks − 1`: week `addDays(raceWeek, (k + 1) * 7)`, `phase: "recovery"`, `role: "recovery"`, `km = floorHalf(peak * row.volume[k])` (the same as `volumes()`' recovery branch with `peakKm: peak` and no build week in the chunk; call it that way, as one more chunk of `row.weeks` recovery roles with `recovery: { date: race.date, distanceKm, priority: "A", peakKm: peak }`), `longKm` as in 4. The skeleton ends there.

`floorHalf` is `Math.floor(n * 2) / 2`, as in `blockplan.ts`.

**Bands for the UI:**

```ts
export interface PhaseBand { phase: PlanPhase; from: ISODate; weeks: number; km: number }
/** Consecutive weeks with the same phase as one band; km = the sum of the weeks' km (null km counts 0). */
export function bandsOf(weeks: { weekStart: ISODate; phase: PlanPhase; km: number | null }[]): PhaseBand[];
```

### Step 2: the block engine (`shared/blockplan.ts`)

1. **Export the projection entry:** `export const projectVolumes = (seed: BlockSeed) => volumes(seed, 1);` (`Volume` becomes an exported interface).
2. **New `BlockSeed` fields:**

   ```ts
   /** Where a race plan's chunk ramps from (docs/decisions/fartlek-race-plan-skeleton.md); default tolerance.km. Never raises a cap. */
   anchorKm?: number;
   /** After a break of 8+ days: the first build week is at most this many km (RACE_PLAN.back). */
   backKm?: number | null;
   /** Other races in the weeks (B races, A races other than `race`): each week holding one is a B race week. */
   otherRaces?: { date: ISODate }[];
   ```

3. In `volumes()`: `const anchor = Math.max(seed.anchorKm ?? seed.tolerance.km, NEXT.startKm);`. In the build branch, `first` becomes `i === 0 ? Math.min(seed.firstWeekMax ?? Infinity, seed.backKm ?? Infinity) : Infinity`.
4. **Race weeks per week, not per seed.** In the taper/race branch, a `race` week is an A race week only when it holds `seed.race` and `seed.race.priority === "A"`: `const holds = (d: ISODate) => d >= ws && d <= addDays(ws, 6)` with `ws = addDays(seed.startWeek, i * 7)`; `const aWeek = role === "race" && seed.race?.priority === "A" && holds(seed.race.date)`. Use `share = role === "taper" ? … : aWeek ? (seed.taper?.race ?? tune().taper.race) : tune().taper.bRace` and `base = role === "race" && !aWeek ? prev : peak`. Without `otherRaces` nothing changes.
5. In `weeksFor`, after `aroundRace` for `seed.race`, apply `aroundRace` again for each `seed.otherRaces` date inside the week.
6. **The long-run hold** in `weeksFor`, right after `longKm` is computed: when `seed.phase` is set and `v.role === "build"`, `const wip = wipOf(ws.weekStart, seed.phase.race.date)`, `const h = RACE_PLAN.longPeak[seed.phase.race.kind]`; if `wip >= h.holdTo && wip <= h.holdFrom` then `longKm = Math.min(longKm, longest)`. It only lowers, so no guard changes; it applies whether or not a plan is stored, so a block made without a plan holds the same way.

### Step 3: actual-only inputs (`server/routes/blocks.ts`, `server/raceplan.ts`)

1. **`kmByDay(ctx, from, to, o: { planned?: boolean } = {})`**: with `o.planned === false`, skip `openToday` and the planned workouts after today (only activities up to today). `weeksBefore(ctx, weekStart, weeks, o = {})` passes `o` on. Default unchanged, so every existing caller behaves as before.
2. `longestRun` gets the same option.
3. **The skeleton never reads `seedFor`**: `seedFor` projects planned load into fitness and fatigue and planned km into `toleranceKm`, which is right for the block being planned and wrong for the proven tolerance of a 30-week projection. Its inputs come from a new `skeletonInputs` (below), with `tolerance(weeksBefore(ctx, nextWeek, BLOCK.tolerance.lookbackWeeks, { planned: false }))` where `nextWeek = weekStartOf(addDays(ctx.today, 7), ctx.settings.weekStart)` (so the running week's actual km count). Skeleton rows are not workouts, so `kmByDay`, `weeksBefore` and `longestRun` never see them; a test pins it.
4. **`breakBefore(ctx, startWeek): number`** (new, in `server/routes/blocks.ts`): the days in a row without a run activity ending yesterday (or the day before `startWeek` when that is earlier), looking back at most 35 days; 0 when the runner ran on that day. Only activities count (a planned session is not a run).

New file `server/raceplan.ts`:

```ts
/** The next A race that is a marathon or half, inside its window from `startWeek`; with its kind and weeks to go. */
export function planRaceFor(ctx: Ctx, startWeek: ISODate): { race: Race; kind: RaceKind; weeksToRace: number } | null;
/** The same race beyond the window: when its plan starts (`addDays(raceWeek, -(window - 1) * 7)`). */
export function farRaceFor(ctx: Ctx, startWeek: ISODate): { race: Race; kind: RaceKind; weeksToRace: number; planFrom: ISODate } | null;
/** Stored rows of the plan for a race, oldest first. */
export function storedPlan(ctx: Ctx, raceId: number): PlanWeekRow[];
/** Everything `projectSkeleton` needs for weeks from `firstWeek`, after `blockWeeks` (the block just generated, or none). */
export function skeletonInputs(ctx: Ctx, pr: { race: Race; kind: RaceKind }, firstWeek: ISODate, blockWeeks: { weekStart: ISODate; km: number; role: WeekRole; longKm: number | null }[]): SkeletonInput;
/** The road shown in the dialog and the plan view (shape in step 5). */
export function roadFor(ctx: Ctx, pr: { race: Race; kind: RaceKind }, o: { skeleton: Skeleton; blockWeeks?: …; stored: boolean }): RaceRoad;
/** Replace the plan's rows from `fromWeek` on (all races), in a transaction the caller holds. */
export function writePlan(tx: Tx, userId: number, raceId: number, fromWeek: ISODate, rows: Omit<PlanWeekRow, "userId">[], computedOn: ISODate): void;
```

`skeletonInputs` details:
- `planStart`: the first stored row's `weekStart` for the race when there is one, else the first week of `blockWeeks`, else `firstWeek`.
- `window`: the 3 weeks before `firstWeek` as `weeksBefore(ctx, firstWeek, 3)` (planned counted: the block just written or shown is what comes before), with weeks that are in `blockWeeks` replaced by their km (the GET has not written the block yet).
- `tolerance`: actual only, as in 3.3.
- `anchorKm`: the biggest `km` of `blockWeeks` with role `build`, else `tolerance.km`.
- `peakKm`: the biggest of `blockWeeks` build km and the actual weekly km since `planStart` (`weeksBefore(…, { planned: false })`).
- `longestKm`: `Math.max(longestRun(ctx, addDays(firstWeek, -NEXT.spikeDays), addDays(ctx.today, -1), { planned: false }), ...blockWeeks.map((w) => w.longKm ?? 0))`.
- `easyPace`: `stepRefs(ctx, ctx.today).easyPace`.
- `others`: races on the race list, any priority except C, other than the plan race, dated from `planStart` to the race; through `otherRacesIn`.
- `backDays`: `breakBefore(ctx, first week of blockWeeks ?? firstWeek)`.

### Step 4: storage (`server/db/schema.ts`, migration)

```ts
/**
 * The race plan's weeks (docs/decisions/fartlek-race-plan-skeleton.md): phase, role and km target of every week from the plan's start to the end
 * of the race's recovery. `km` null = the week is in a block, whose week_targets row holds its target. Never read as planned load or tolerance.
 */
export const racePlanWeeks = sqliteTable("race_plan_weeks", {
  userId: userRef(),
  weekStart: text("week_start").notNull(),
  raceId: integer("race_id").notNull(),
  phase: text("phase").notNull(),
  role: text("role").notNull(),
  km: real("km"),
  longKm: real("long_km"),
  computedOn: text("computed_on").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.weekStart] }), index("race_plan_weeks_race").on(t.userId, t.raceId)]);
```

Run `npm run db:generate -w apps/fartlek -- --name race_plan` and commit the SQL and `meta/`. It should read:

```sql
CREATE TABLE `race_plan_weeks` (
	`user_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`race_id` integer NOT NULL,
	`phase` text NOT NULL,
	`role` text NOT NULL,
	`km` real,
	`long_km` real,
	`computed_on` text NOT NULL,
	PRIMARY KEY(`user_id`, `week_start`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `race_plan_weeks_race` ON `race_plan_weeks` (`user_id`,`race_id`);
```

- `server/repo.ts`: `listPlanWeeks(db, userId, from, to)` and `planWeeksOf(db, userId, raceId)`; add `t.racePlanWeeks` to `TRAINING_TABLES`.
- The primary key keeps one plan per week; `writePlan` deletes **every** row of the user from `fromWeek` on before inserting, so a newer plan (another race) replaces an older one's future weeks. Rows before `fromWeek` stay as the record of the weeks done.
- `race_id` is a plain integer like `race_checks.race_id`; the race routes delete the rows (step 6).

### Step 5: routes (`server/routes/blockplan.ts`)

1. **`writeTargets` deletes first.** Before the inserts: `tx.delete(t.weekTargets).where(and(eq(t.weekTargets.userId, userId), gte(t.weekTargets.weekStart, startWeek), lte(t.weekTargets.weekStart, addDays(startWeek, (weeks.length - 1) * 7)))).run();` then plain inserts (the `onConflictDoUpdate` can stay). Both the block POST and the re-plan POST use it, so a (re)generated block's weeks always hold exactly the block's targets. Undo already restores `targetsBefore`, which `getTargets` reads over the same range.
2. **Which race decides the weeks.** In `GET` and `POST /plan/block-suggest`: `const pr = planRaceFor(ctx, startWeek);` and `const raceAhead = pr ? pr.race : raceNear(…)` (unchanged for other distances and B races). `racePlanFor(raceAhead, startWeek, asked)` then counts the chunks back from the plan race as today, up to 30 (half 20) weeks; within 8 weeks both last blocks together, as today. The other races honoured in the block's weeks go on the seed as `otherRaces` (and, from the post-race recovery plan, `recovery` for the weeks after one).
3. **`GET /plan/block-suggest`**: after the suggestion, when `pr` is set, project and add the road:

   ```ts
   const blockWeeks = suggestion.weeks.map((w) => ({ weekStart: w.weekStart, km: weekKm(w.items), role: w.role, longKm: longOf(w.items) }));
   const firstWeek = addDays(startWeek, weeks * 7);
   const sk = projectSkeleton(skeletonInputs(ctx, pr, firstWeek, blockWeeks));
   road = roadFor(ctx, pr, { skeleton: sk, blockWeeks, stored: false });
   ```

   Also, when `breakBefore(ctx, startWeek) > RACE_PLAN.back.absorbDays`, pass `backKm = floorHalf(RACE_PLAN.back.share × (stored skeleton km of startWeek ?? tolerance.km))` to `blockSeedFor` (new option, put on the seed). Add `road` (or null) and `back: { days, km } | null` to the JSON. Each chunk in `racePlan.chunks` gets `blockKind: chunkKind(phases of its weeks)`.
   Beyond the window, `farRaceFor` gives `farRace: { name, date, weeksToRace, planFrom }` in the JSON (the dialog says when the plan starts); the block is an ordinary base block.
4. **`POST /plan/block-suggest`**: in `blockParts`, accept a `BlockKind` as `kind` (`BLOCK_KINDS.includes(p.kind) ? p.kind : BLOCK_KIND_OF[p.kind] ?? "base"`); the client sends `blockKind`. When `pr` is set, inside the same `db.transaction`, after `writeTargets`: compute the skeleton from the **posted** weeks (`blockWeeks` from `weeks` and `roles`), then `writePlan(tx, ctx.userId, pr.race.id, startWeek, rows, ctx.today)` with rows for the block's weeks (`phase` from the skeleton's phases, `role` from `roles`, `km: null`, `longKm: null`) and for every skeleton week (`km`, `longKm`). Before the transaction, read `planBefore = listPlanWeeks(db, ctx.userId, startWeek, '9999-12-31')` and return it in the response with `blockIds`, `ids`, `removed`, `targetsBefore`.
5. **`POST /plan/block-suggest/undo`**: accept `planBefore` (at most 60 rows, each validated: `weekStart` a date ≥ `from`, `phase` and `role` from their lists, `km`/`longKm` numbers or null, `raceId` an integer of one of the user's races); in the transaction, delete the user's `race_plan_weeks` from `from` on and insert `planBefore`.
6. **Re-plan (`GET`/`POST /blocks/:id/replan`)**: with `pr` set, the GET returns the road after the re-planned weeks (as in 3, `firstWeek = addDays(st.newEnd, 1)`), and the POST rewrites the plan rows from `s.first` the same way in its transaction (the block's weeks `km: null`; the skeleton after `newEnd` recomputed). The re-plan's own goal logic (remaining km of the block's goal) is unchanged; it never reaches into skeleton weeks.
7. **`GET /plan/race-plan`** (new, same router):

   ```ts
   type RacePlanRes =
     | { ok: false; reason: "noRace" }
     | { ok: false; reason: "far"; race: { id: number; name: string; date: ISODate; distanceKm: number }; weeksToRace: number; planFrom: ISODate }
     | { ok: true; road: RaceRoad };
   ```

   The race: the earliest A marathon or half whose recovery has not ended (`race week + recovery weeks >= running week`). With stored rows: the road from them (`stored: true`). Without: a preview projected from the next open week (`startWeeks(ctx, blocks).byDefault`, no block weeks; `stored: false`). Weeks before today show what was run.

`RaceRoad` (in `shared/raceplan.ts`, so the client imports the type):

```ts
export interface RoadWeek {
  weekStart: ISODate; wip: number; phase: PlanPhase; role: WeekRole;
  /** done: actual run km; block: the week's target (week_targets, else planned sessions); now: the suggestion shown; skeleton: the projection. */
  source: "done" | "block" | "now" | "skeleton";
  km: number | null; longKm: number | null;
}
export interface RaceRoad {
  race: { id: number; name: string; date: ISODate; distanceKm: number; kind: RaceKind; goalSeconds: number | null };
  planStart: ISODate; weeksToRace: number; lengths: PhaseLengths;
  weeks: RoadWeek[]; bands: PhaseBand[];
  /** The first week inside RACE_PHASE.weeks: race-pace sessions from here. */
  racePaceFrom: ISODate | null;
  longPeak: { weekStart: ISODate; km: number; wip: number } | null;
  /** Under RACE_PLAN.phases[kind].minWeeks at the plan's start; `suggestedSeconds` = today's prediction, rounded up to the minute, when slower than the goal (or no goal). */
  short: { minWeeks: number; goalSeconds: number | null; suggestedSeconds: number | null } | null;
  warnings: ("longShort")[];
  /** Every other race in the plan (all are honoured); `close` = inside the plan race's peak block or taper, shown with `rp.otherClose`. */
  others: { name: string; date: ISODate; close: boolean }[];
  stored: boolean; computedOn: ISODate | null;
}
```

- `source` of a week: before the running week `done`; covered by an existing block `block`; in the suggestion shown `now`; else `skeleton`.
- `warnings`: `longShort` when `kind === "marathon"` and `longPeak.km < RACE_PHASE.warn.longKm` (25).
- `short.suggestedSeconds`: `racePrediction(ctx, race, perfData(ctx)).current?.seconds`, `Math.ceil(s / 60) * 60`; null when there is no prediction or it is not slower than the goal.

### Step 6: the race routes and the week view (`server/routes/plan.ts`)

- **`DELETE /races/:id`**: also `db.delete(t.racePlanWeeks).where(and(eq(t.racePlanWeeks.userId, uid), eq(t.racePlanWeeks.raceId, id)))`. Blocks and sessions already made stay (races are not linked to blocks); the next "Skapa block" plans without the race, and "Räkna om resten" re-plans a peak block whose race is gone as an ordinary block.
- **`PUT /races/:id`**: when `date`, `distanceKm` or `priority` changed (compare with the row before the update), delete the race's plan rows the same way. A moved race gets a new plan from the next block; a new goal time keeps the rows (the skeleton is in km).
- **`GET /plan/weeks`**: add `skeleton: Record<ISODate, { phase: PlanPhase; km: number; longKm: number | null }>` for stored rows in range with `km != null`. `weekSummaries` and compliance are unchanged: they read `week_targets` only.
- `POST /plan/clear` leaves plan rows alone.

### Step 7: UI (`client/`)

- **`client/raceroad.tsx`** (new): `export function RaceRoad({ road, compact }: { road: RaceRoad; compact?: boolean })`.
  - Title `rp.title`. One row of phase bands (`flex-grow` = weeks): name (`block.kind.base` / `.build` / `.specific` / `.taper` / `.recovery`, `rp.phase.race`), weeks (`tn("be.weeksN", n)`) and km (`fmt.dist`).
  - Under it one bar per week, height ∝ km (the biggest week = 100 %), the colours of `RacePlanView` per role (recovery `bg-signature opacity-30`). `done` grey, `block` and `now` solid with `now` ringed (`ring-1 ring-primary`), `skeleton` dashed outline with 60 % opacity. Each bar has a `title` and an `aria-label` (`rp.weekLabel`); a visually hidden table lists week, phase and km for screen readers.
  - Marks: the race flag on the race week, `rp.racePace` over `racePaceFrom`, `rp.longPeak` under `longPeak`'s week.
  - Lines under the bars: `rp.now` (what is planned now), `rp.recovery`, each `others` entry (`rp.other`, plus `rp.otherClose` for one in `close`), `rp.longShort` when warned.
  - `short`: an amber note at the top, `rp.short`, then `rp.goal.lower` with a button `rp.goal.use` that `PUT`s the race with `goalSeconds: suggestedSeconds` (the other fields as they are) and refetches. Never applied without the tap.
  - Phone first: the week bars scroll sideways inside their box (`overflow-x-auto`, like `RacePlanView`) at most; the page never does. `compact` hides the lines and the hidden table and shows only bands and bars (for above the editor).
- **`client/suggestblock.tsx`**:
  - `SugOk` gets `road: RaceRoad | null`, `back: { days: number; km: number } | null`, `farRace: { name: string; date: ISODate; weeksToRace: number; planFrom: ISODate } | null`; `RaceChunk` in `RacePlan` gets `blockKind?: BlockKind`.
  - Step 1: when `ok.road`, show `<RaceRoad road={ok.road} />` in place of `<RacePlanView>`; else as today. `farRace` adds the line `rp.far` above the rhythm cards. `back` adds `rp.back`.
  - Edit step: `<RaceRoad road={ok.road} compact />` above the `BlockEditor`, so phases, km per week and the block's sessions are on one screen.
  - `onApply`: `blocks` sends `kind: c.blockKind ?? c.kind`.
  - Undo (`BlockApplied` and the undo call in `pages/Plan.tsx`): carry `planBefore` from the POST response to `/plan/block-suggest/undo`.
- **`client/pages/Plan.tsx`**: in the week header, when the week has no target and `skeleton[weekStart]` exists, a dashed chip `rp.weekTarget`.
- **`client/pages/Blocks.tsx`** (optional, last): in the season timeline, the stored skeleton after the last block as dashed ghost bands, from `GET /plan/race-plan`.
- **Strings** (`client/i18n/blockplan.ts`, en / sv):

  | key | en | sv |
  |---|---|---|
  | `rp.title` | The road to {race} | Vägen till {race} |
  | `rp.phase.race` | Race | Lopp |
  | `rp.weekLabel` | Week {week}: {phase}, {km} | Vecka {week}: {phase}, {km} |
  | `rp.weekTarget` | Plan ~{km} | Plan ~{km} |
  | `rp.now` | Planned now: {weeks} with sessions. The later weeks are targets; each block is made when the one before ends. | Planeras nu: {weeks} med pass. Veckorna efter är mål; varje block görs när det förra är slut. |
  | `rp.racePace` | Race pace from here | Loppfart härifrån |
  | `rp.longPeak` | Longest run ~{km} | Längsta passet ~{km} |
  | `rp.longShort` | The longest run reaches about {km}. Under 25 km goes with a slower finish. | Längsta passet når ungefär {km}. Under 25 km brukar ge en långsammare avslutning. |
  | `rp.recovery` | Then {weeks} of recovery, and ordinary blocks again. | Sen {weeks} återhämtning, och vanliga block igen. |
  | `rp.other` | {name} ({date}) is planned as a race: a lighter week and recovery after it. | {name} ({date}) planeras som lopp: en lättare vecka och återhämtning efter. |
  | `rp.otherClose` | {name} ({date}) is close to {race}; racing it hard can cost some of the peak form. | {name} ({date}) ligger nära {race}; springer du det hårt kan det kosta lite av formtoppen. |
  | `rp.short` | {weeks} to {race} is short for a {dist}; {min} is the usual minimum. Base and build are shortened, race pace and taper kept. | {weeks} till {race} är kort för en {dist}; {min} brukar vara minimum. Bas och uppbyggnad kortas, loppfart och nedtrappning blir kvar. |
  | `rp.goal.lower` | Aim for about {time} (today's prediction) rather than {goal}. | Sikta på ungefär {time} (dagens prognos) i stället för {goal}. |
  | `rp.goal.use` | Use {time} as the goal | Använd {time} som mål |
  | `rp.far` | {race} is {weeks} away. Its plan starts in week {week}; until then, ordinary blocks. | {race} är om {weeks}. Planen börjar vecka {week}; fram till dess vanliga block. |
  | `rp.back` | Back after {days} days without running: the first week is at most {km}. | Tillbaka efter {days} dagar utan löpning: första veckan högst {km}. |

  `{weeks}` through `tn("be.weeksN", n)`, `{km}` through `fmt.dist`, `{time}` and `{goal}` through the race page's time formatter, `{dist}` "marathon"/"maraton" or "half marathon"/"halvmaraton" (`rp.dist.marathon`, `rp.dist.half`, two more keys).

### Step 8: tests

**`shared/raceplan.test.ts`** (new):

1. `phaseLengths`: every value of both lists in [phase lengths](#phase-lengths) (a table test), and for every `n` from 1 to 30: the parts add up to `n`, none is negative, `taper` is 2 from `n = 2`.
2. Compression order: for marathon `n` 6–11, `specific === 4` and `taper === 2`; base reaches 0 (at 10) before build drops under 4 (at 9). Half `n` 4–7: `specific === 2`, `taper === 2`.
3. `phaseOfWeeks({ base: 4, build: 6, specific: 4, taper: 2 })` → 4 × base, 6 × build, 4 × specific, `"taper"`, `"race"` (16 entries).
4. `chunkKind`: `["build","build","specific","specific"]` → `"specific"` (tie to later); `["base","base","base","build"]` → `"base"`; `["specific","specific","taper","race"]` → `"specific"`; `["recovery","recovery"]` → `"recovery"`. The worked chunk kinds in [phase lengths](#phase-lengths) for marathon 12, 16, 20, 28, 30 and half 8, 12, 16 (with `raceChunks`).
5. `raceKindOf`: 42.195 → marathon, 41.5 → marathon, 21.1 → half, 22 → half, 10 → null, 30 → null.
6. `wipOf`: race Sunday 2027-03-21, week 2027-03-15 → 1, 2027-03-08 → 2, 2027-03-22 → 0, 2026-11-30 → 16.
7. **Golden projection** (fails loudly when `TUNE` defaults or the ramp change; then update the numbers on purpose). Input: marathon, race Sunday 2027-03-21, `planStart = firstWeek = 2026-11-30` (16 weeks), `window [40, 44, 38]`, tolerance `{ km: 45, peakKm: 45, peakWeek: null, weeksAgo: 2 }`, `anchorKm 45`, `peakKm 0`, `longestKm 18`, `easyPace 330`, no others. Expected `[wip, role, km, longKm]`, from week 1 on:
   16 b 45 18.5 · 15 b 47 19 · 14 b 49.5 19.5 · 13 l 34.5 13.5 · 12 b 48 19.5 · 11 b 51.5 20 · 10 b 54 21 · 9 l 37.5 14.5 · 8 b 52 21 · 7 b 56.5 21.5 · 6 b 59 22 · 5 l 41 15.5 · 4 b 57 22 · 3 b 62.5 22 · 2 taper 43.5 15.5 · 1 race 31 null · then recovery 9 3 · 28 8 · 40.5 12 · 50 15.
   Phases: 4 × base, 6 × build, 4 × specific, taper, race, 4 × recovery. `peakKm` 62.5. `longPeak` is `{ weekStart: "2027-02-08", km: 22, wip: 6 }` (the first week with the maximum); wip 4 and 3 hold at 22 (without the hold wip 3 would step higher).
   (Numbers from a prototype of this algorithm on the code of 2026-11-24.)
8. **Caps come from the actual tolerance:** `window [20, 20, 20]`, tolerance 45: the first week is ≤ `blockWeekCap([20, 20, 20], 45).cap`; with tolerance 30 instead it is ≤ `blockWeekCap([20, 20, 20], 30).cap` (smaller), whatever `anchorKm` is.
9. **Anchor moves, caps don't:** with `anchorKm` 80 and tolerance 45 (golden window), the first build week is ≤ `blockWeekCap([40, 44, 38], 45).cap`, and every week is ≤ the cap its own window gives.
10. **Back after a break:** `backDays: 10` and the first chunk's first build week is ≤ `floorHalf(0.7 × 45)` = 31.5; `backDays: 7` changes nothing.
11. **Other races:** a B half on Sunday 2027-01-17 (wip 10) → that week's role `race` with km `floorHalf(prev × TUNE.taper.bRace)`, the next week `recovery` (B half row: 1 week, 85 % of the peak so far); a B race at wip 3 → honoured and in `close`: the week keeps its `taper` role and km, the race day is the race session, no recovery weeks replace the taper; `rp.otherClose` is shown.
12. **Half golden:** half, race 12 weeks out, `window [30, 34, 28]`, tolerance 35, `longestKm 14`: lengths 3/4/3/2; 2 recovery weeks at the end (`RECOVERY.A.half`); `longPeak.wip >= 4`; wip 3 `longKm <= longPeak.km`.
13. **Over:** `firstWeek` after the race week → only recovery weeks.
14. **Performance guard:** 200 projections of a 30-week marathon in under 1 s (loose on purpose; the point is that it builds no sessions).

**`shared/blockplan.test.ts`**:

- `projectVolumes(seed)` equals the `targetKm` of `suggestBlock` for a calm seed (no fitting needed), so the projection and the engine agree.
- `anchorKm` unset → same weeks as today (every existing test passes unchanged).
- `otherRaces`: a 4-week seed with roles `[build, race, build, lighter]`, `race: null`, `otherRaces: [{ date: <Sunday of week 2> }]` → week 2 is `floorHalf(week1 × TUNE.taper.bRace)` and its days after the race hold only short easy runs (`aroundRace`).
- Long-run hold: a phase seed (marathon) whose weeks are wip 6–3 with roles build, lighter, build, build → the long runs of wip 4 and 3 are ≤ the longest of wip 6.

**`server/app.test.ts`**:

- `GET /plan/block-suggest` with an A marathon 16 weeks out: `road.weeks.length === 16 + 4`, the first 4 `source: "now"`, the rest `skeleton`, every one with `km > 0`; `racePlan.chunks[0].blockKind === "base"`.
- `POST` then `GET /plan/race-plan`: `stored: true`, the block's weeks `source: "block"`; `race_plan_weeks` rows for the block's weeks have `km` null. `week_targets` for the block's weeks equal the posted weeks' km; a target set before in one of those weeks (with another km and note) is gone.
- Undo: the plan rows and targets are what they were before the POST.
- `PUT /races/:id` with a new date → `race_plan_weeks` rows for it gone; with a new goal → kept. `DELETE /races/:id` → gone, blocks kept.
- A marathon 34 weeks out → `farRace.planFrom` = race week − 29 weeks; no `road`. A 10K A race 20 weeks out → no `road` (window 16, as today).
- A marathon 10 weeks out → `road.short.minWeeks === 12`; lengths 0/4/4/2.
- Inserting a skeleton row with `km: 80` changes neither `weeksBefore` nor `tolerance` for the next block.

**`server/scenarios.ts`**: add "marathon in 20 weeks" and "marathon in 28 weeks" (45 km a week), "half in 12 weeks" (35 km) and "marathon in 10 weeks" (short); print phases, roles, km and long run per week, and where the long-run peak lands.

### Step 9: docs

Mark this page built and note what changed while building; mark the closed items in [Mål till plan](fartlek-goal-to-plan.md) and [post-race recovery](fartlek-post-race-recovery.md); add a log entry and run `npm run docs:index`.

## Performance

- `fitWeeks` is O(n²) in the weeks (a bisection of about 14 evaluations per build week, each building every week's sessions), and the taper search and `deepen` add more. That is fine for 4–8 weeks and far too slow for 30. The skeleton never calls them: it is `volumes()` per chunk (O(weeks)) and the long-run ladder per week (O(1)), so a 30-week road is a few hundred arithmetic steps.
- `GET /plan/block-suggest` still runs the full engine only for the next block; the road adds one projection. `GET /plan/race-plan` reads stored rows and projects only when there are none.
- The fitness projection (`planEnd`, 200 days) is unchanged: skeleton weeks have no sessions, so they add no load.

## Edge cases (checklist)

- **No history** (`noHistory`): the first chunk starts at `NEXT.startKm` as today; the skeleton grows from there with the careful cap. A runner under about four weeks of Garmin history gets the honest start of [Mål till plan](fartlek-goal-to-plan.md); the road is still shown.
- **A block already running** when the plan starts: its weeks are `block`, the skeleton begins after it; `planStart` is the first block generated with the plan.
- **The runner's own block** (mode "own", or a rhythm picked): stored the same way; the skeleton after it is recomputed from what was posted. A block that doesn't end on a chunk edge leaves a partial chunk, projected with the roles `raceChunks` gives those weeks.
- **Exactly at the window** (30 / 20 weeks): planned. 31 / 21: `farRace`.
- **Two A races** (a half in spring, a marathon in autumn): the first one inside its window gets the plan; the second is beyond or is an `other` race of the first plan only if it is before it. When the first race's recovery ends, the next "Skapa block" starts the second plan, replacing future rows.
- **The race moves later:** rows deleted; the next block starts a plan with a new `planStart` (a longer base). **Earlier:** the same, and a plan that is now short warns.
- **A B race in the peak block or the taper:** still planned (the runner decides, not the engine): taper weeks keep their role and km, the race day becomes the race session, and the plan shows `rp.otherClose`.
- **A missed week inside a block:** the adaptive engine's re-plan and Monday check-in handle it ([adaptive engine](fartlek-adaptive-engine.md)); the re-plan POST recomputes the skeleton after the block.
- **A break across the block edge:** `breakBefore` counts actual days off up to yesterday; 8 days or more caps the next block's first build week at 70 % of what the plan had for it.
- **Taper weeks of the skeleton** use `TUNE.taper`; the real taper depth is searched when the peak block is generated, so the road's taper km may change then.
- **Race-pace lock:** unchanged ([race-specific phase](fartlek-race-specific-phase.md)); `rp.goal.use` changing the goal can remove a pending pace question (goal and prediction then within 3 %).
- **Demo mode:** nothing to seed; the road is computed from the demo user's races like any user's.
