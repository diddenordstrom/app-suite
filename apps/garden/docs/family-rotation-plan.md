# Family Rotation Refinement — Implementation Plan

> Companion document to `BACKLOG.md` ("Family rotation refinement") and `family-rotation-research.md`. This plan is the execution blueprint for the QA Engineer + Developer agents. Read all three before starting work.

Replaces the flat `ROTATION_LOOKBACK_DAYS = 730` blanket with:

- Two new seeded tables (`crop_family_rotation`, `family_rotation_bonus`).
- A new `getRotationStatus(locationId, candidateFamily, today)` method on `SuggestionService` returning `{ allowed, penalty, bonus, advice? }`.
- Per-candidate penalty/bonus threaded through `rankByCropDemandGap` alongside the existing companion deltas.
- Three new i18n advice keys + one wishlist "maxed out family" hint.
- A `getMaxedOutFamilyHints` service method surfaced on the suggestions page.

---

## TDD discipline (non-negotiable)

**Per-behavior Red-Green-Red-Green, not batch test-first.**

Each test the QA agent writes must be followed by just enough production code to turn it green before the next test is written. The rules:

- One failing test at a time. Run it. See it red.
- Add the smallest possible production change to turn that single test green.
- Run again. Confirm green.
- THEN write the next failing test.
- Do not write a second test until the first is green.
- Do not write production code that is not driven by an already-red test.
- Do not write the full failing suite up front — that turns TDD into batch regression-testing and destroys the per-decision signal.

This applies to every layer below. Each bullet in a "Test-first sequence" is one Red→Green increment, in the order listed.

---

## Source-of-truth numbers

From `BACKLOG.md` and `family-rotation-research.md`:

| Family         | Hard excl. (yrs) | Soft penalty (yrs) | Primary driver                     |
| -------------- | ---------------- | ------------------ | ---------------------------------- |
| Brassicaceae   | **6**            | —                  | Clubroot 20-yr persistence         |
| Alliaceae      | —                | **4**              | White rot 20–40 yr persistence     |
| Solanaceae     | **4**            | —                  | Verticillium 7–14 yrs              |
| Cucurbitaceae  | —                | **3**              | Fusarium 4–5 yrs                   |
| Apiaceae       | —                | **2**              | Carrot fly + Sclerotinia 3–5 yrs   |
| Chenopodiaceae | —                | **3**              | Cercospora 3 yrs in debris         |
| Fabaceae       | —                | **4**              | Aphanomyces 10+ yrs + autotoxicity |
| Asteraceae     | —                | **2**              | Sclerotinia 3–5 yrs                |
| Poaceae        | —                | **2**              | Corn smut 4 yrs in soil            |

Scoring constants (align with existing companion scale at `suggestion.service.ts:211-212`):

```ts
ROTATION_SOFT_PENALTY = +25; // matches COMPANION_BAD_DELTA
LEGUME_BONUS_HIGH = -15; // matches COMPANION_GOOD_DELTA (Brassicaceae, Solanaceae)
LEGUME_BONUS_MODERATE = -10; // Cucurbitaceae, Poaceae, Chenopodiaceae, Asteraceae
LEGUME_AFTER_LEGUME_PENALTY = +15; // autotoxicity signal
```

Legume bonus lookback is a **365-day rolling window from the candidate's `sowDate`**, not a calendar-year boundary. Rationale: the agronomic signal is "is there still residual N + root residue in the soil?" which decays on a rolling basis. A January candidate after June Fabaceae is the exact case the bonus is designed to surface. Bonus expires once the predecessor is > 365 days old.

---

## Layer 1 — Schema + migration + test-db mirror

### Files owned

- `/Volumes/Development/self-sufficiency-garden/server/db/schema.ts` _(modified)_ — add `cropFamilyRotation` and `familyRotationBonus` drizzle tables + exported `$inferSelect` / `$inferInsert` types.
- `/Volumes/Development/self-sufficiency-garden/server/plugins/seed.ts` _(modified)_ — add both tables to `TABLES_SQL` AND to `MIGRATIONS_SQL` (idempotent `CREATE TABLE IF NOT EXISTS`, wrapped in try/catch like the existing companion table at line 313).
- `/Volumes/Development/self-sufficiency-garden/server/test-utils/create-test-db.ts` _(modified)_ — mirror the two `CREATE TABLE` statements so unit/integration tests can insert rows without running the seed pipeline.

### Schema (per BACKLOG)

```ts
crop_family_rotation {
  family: text PK,                  // 'Brassicaceae', etc.
  exclusionYears: integer NOT NULL, // hard cutoff (0 = soft only)
  penaltyYears: integer NOT NULL,   // soft window for ranking
  source: text NOT NULL,
  sourceNote: text,
}

family_rotation_bonus {
  predecessorFamily: text NOT NULL,
  successorFamily: text NOT NULL,
  bonusScore: integer NOT NULL,     // negative = bonus, positive = penalty
  source: text NOT NULL,
  PRIMARY KEY (predecessorFamily, successorFamily)
}
```

**`penaltyScore` is intentionally absent from `crop_family_rotation`** — the magnitude is the `ROTATION_SOFT_PENALTY` constant in code (mirrors how `COMPANION_BAD_DELTA` lives in code, not the DB). Reject any change that adds it to the table.

`family_rotation_bonus` keeps a per-row magnitude because the two-tier −15/−10/+15 split needs row-level variation.

### Test-first sequence

This layer is pure DDL; there is no business logic to drive with a unit test. The "red" that proves the DDL works is Layer 2's first test (it inserts a row and reads it back). So Layer 1 is a no-test scaffolding pass — but it MUST land first because every later layer depends on the tables existing.

Acceptance criteria for Layer 1:

- `pnpm typecheck` green.
- `pnpm test` still green (no existing test is broken).
- A fresh in-memory DB initialised via `create-test-db.ts` contains both empty tables (Layer 2's first insert test will prove this).

### DDD boundary notes

- No defaults on the integer columns beyond `NOT NULL` — every row is explicit seed data, not ambient.
- No business logic in schema files; only structure.
- The drizzle table names use camelCase (`cropFamilyRotation`); the SQL table names use snake_case (`crop_family_rotation`). Match the existing convention exactly.

### Dependencies

None.

---

## Layer 2 — Seed data

### Files owned

- `/Volumes/Development/self-sufficiency-garden/server/db/seed-data.ts` _(modified)_ — export `FAMILY_ROTATION_RULES: CropFamilyRotationSeed[]` (9 rows) and `FAMILY_ROTATION_BONUSES: FamilyRotationBonusSeed[]` (7 rows: 2 top-tier + 4 moderate + 1 autotoxicity).
- `/Volumes/Development/self-sufficiency-garden/server/plugins/seed.ts` _(modified)_ — insert both arrays via `onConflictDoNothing()`, same pattern as the existing `COMPANION_PAIRS` loop at line 404.

### Source URL discipline

Every seeded row's `source` column MUST be a URL drawn from `family-rotation-research.md` §7. Suggested mapping (Developer may pick a closer match if more specific):

- Brassicaceae → `https://www2.jordbruksverket.se/webdav/files/SJV/trycksaker/Pdf_ovrigt/p7_7.pdf`
- Alliaceae → `https://www.rhs.org.uk/disease/onion-white-rot`
- Solanaceae → `https://content.ces.ncsu.edu/verticillium-wilt-of-tomato-and-eggplant`
- Cucurbitaceae → `https://pnwhandbooks.org/plantdisease/host-disease/onion-allium-cepa-white-rot` (Researcher: confirm there's no cucurbit-specific PNW page; if there is, use it.)
- Apiaceae → `https://ipm.missouri.edu/MEG/2016/2/Monitoring-Detection-and-Management-of-Lettuce-Drop-caused-by-Sclerotinia-spp/`
- Chenopodiaceae → `https://www.vegetables.cornell.edu/pest-management/disease-factsheets/cercospora-leaf-spot-of-table-beet/`
- Fabaceae → `https://www.ag.ndsu.edu/publications/crops/dry-pea-and-lentil-root-rot-management-guide`
- Asteraceae → `https://ipm.missouri.edu/MEG/2016/2/Monitoring-Detection-and-Management-of-Lettuce-Drop-caused-by-Sclerotinia-spp/`
- Poaceae → `https://extension.umn.edu/corn-pest-management/common-smut-corn`
- Top-tier and moderate-tier bonus rows → `https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2021.767998/full` (N-fixation quantification)
- Autotoxicity row (Fabaceae → Fabaceae) → `https://www.sciencedirect.com/science/article/abs/pii/S0304423811006315`

### Test-first sequence (one Red→Green per row group)

1. **Integration test: `crop_family_rotation` has 9 rows after seed.** Run seed against fresh DB, count rows, assert 9. Implement: add 9 rows to `FAMILY_ROTATION_RULES` (values can be placeholder — only the count matters for this test). Insert loop in `seed.ts`.
2. **Integration test: every `crop_family_rotation` row has a `source` containing `http`.** Already enforced by `NOT NULL` on the column; the test guards against a future placeholder slipping in. Implement: confirm seed rows pass.
3. **Integration test: Brassicaceae row has `exclusionYears=6, penaltyYears=0`.** Implement: lock the values.
4. **Integration test: Solanaceae row has `exclusionYears=4, penaltyYears=0`.** Implement: lock.
5. **Integration test: Alliaceae row has `exclusionYears=0, penaltyYears=4`.** Implement: lock.
6. **Integration test: Cucurbitaceae row has `exclusionYears=0, penaltyYears=3`.** Implement: lock.
7. **Integration test: Apiaceae row has `exclusionYears=0, penaltyYears=2`.** Implement: lock.
8. **Integration test: Chenopodiaceae row has `exclusionYears=0, penaltyYears=3`.** Implement: lock.
9. **Integration test: Fabaceae row has `exclusionYears=0, penaltyYears=4`.** Implement: lock.
10. **Integration test: Asteraceae row has `exclusionYears=0, penaltyYears=2`.** Implement: lock.
11. **Integration test: Poaceae row has `exclusionYears=0, penaltyYears=2`.** Implement: lock.
12. **Integration test: `(Fabaceae, Brassicaceae)` bonus row has `bonusScore=-15`.** Implement: add the row.
13. **Integration test: `(Fabaceae, Solanaceae)` → `-15`.** Implement: add.
14. **Integration test: `(Fabaceae, Cucurbitaceae)` → `-10`.** Implement: add.
15. **Integration test: `(Fabaceae, Poaceae)` → `-10`.** Implement: add.
16. **Integration test: `(Fabaceae, Chenopodiaceae)` → `-10`.** Implement: add.
17. **Integration test: `(Fabaceae, Asteraceae)` → `-10`.** Implement: add.
18. **Integration test: `(Fabaceae, Fabaceae)` → `+15` (autotoxicity).** Implement: add.
19. **Integration test: NO row exists for `(Fabaceae, Apiaceae)` or `(Fabaceae, Alliaceae)`.** These are explicitly excluded (forked-root + low-N rationale per research doc §4.2). The service interprets "no row" as "no bonus" — absence IS the encoding. Implement: confirm seed array does not contain these pairs.

### DDD boundary notes

- Seed data lives in `seed-data.ts`. The service knows table schemas, not row values.
- No i18n strings, no UI prose in this layer.
- `onConflictDoNothing()` is the correct insert pattern — matches the existing companion seed.

### Dependencies

Layer 1.

---

## Layer 3 — `SuggestionService.getRotationStatus`

### Files owned

- `/Volumes/Development/self-sufficiency-garden/server/services/suggestion.service.ts` _(modified)_ — add the four scoring constants, add `getRotationStatus(locationId, candidateFamily, today)` private method, **keep `getRotationFamilies` temporarily** so callers compile; it gets removed in Layer 4.
- `/Volumes/Development/self-sufficiency-garden/server/services/suggestion.service.test.ts` _(modified)_ — new `describe('getRotationStatus', …)` block.

### New scoring constants

Place adjacent to the existing `COMPANION_GOOD_DELTA` / `COMPANION_BAD_DELTA` block around line 211:

```ts
const ROTATION_SOFT_PENALTY = 25; // matches COMPANION_BAD_DELTA
const LEGUME_BONUS_HIGH = -15; // matches COMPANION_GOOD_DELTA
const LEGUME_BONUS_MODERATE = -10;
const LEGUME_AFTER_LEGUME_PENALTY = 15;
```

### Method signature + return shape

```ts
type RotationAdviceKey =
  | 'rotation.advice.legumeBonus'
  | 'rotation.advice.hardExclusion'
  | 'rotation.advice.softPenalty';

type RotationStatus = {
  allowed: boolean;            // false → drop the candidate
  penalty: number;             // 0 or ROTATION_SOFT_PENALTY
  bonus: number;               // 0, LEGUME_BONUS_HIGH, LEGUME_BONUS_MODERATE, or LEGUME_AFTER_LEGUME_PENALTY
  advice?: RotationAdviceKey;  // i18n KEY, never Swedish prose
};

private getRotationStatus(
  locationId: number,
  candidateFamily: string,
  today: Date,
): RotationStatus;
```

**Critical DDD note:** the service returns an i18n KEY string, not a Swedish-language sentence. The existing `formatReason` already embeds keys like `frostGate.advice.requiresFiberduk` and lets the client resolve them (see lines 92–94 of the current service). Follow that exact pattern — do not introduce a new convention.

### Behaviour

1. Read all past plantings on this `locationId`, joined to `crop` for `cropFamily` and `plantedDate`. Order does not matter, all are needed for the bonus + most-recent checks.
2. Look up the candidate family's row in `crop_family_rotation`. If no row, no rule applies (allowed=true, penalty=0, bonus=0).
3. **Hard exclusion check:** if `exclusionYears > 0` and any past planting of the same family has `plantedDate >= today - exclusionYears*365 days`, return `{ allowed: false, penalty: 0, bonus: 0, advice: 'rotation.advice.hardExclusion' }` and short-circuit. Hard exclusion overrides everything.
4. **Soft penalty check:** if `penaltyYears > 0` and any past planting of the same family has `plantedDate >= today - penaltyYears*365 days`, set `penalty = ROTATION_SOFT_PENALTY` and `advice = 'rotation.advice.softPenalty'`.
5. **Legume bonus check:** scan past plantings for ANY Fabaceae planting with `plantedDate >= today - 365 days` (rolling lookback from `today`, which the caller will set to the candidate's sowDate). If found, look up `family_rotation_bonus` for `(predecessorFamily='Fabaceae', successorFamily=candidateFamily)`. If a row exists, set `bonus = row.bonusScore` and `advice = 'rotation.advice.legumeBonus'` (the bonus key WINS over the soft-penalty key because it's the more specific and actionable signal — see Test I).
6. Return the assembled status.

### Test-first sequence

Each bullet = one Red→Green increment. Tests use a real test DB seeded with the two new tables + a `planting` row or two. The QA agent should set up a small fixture helper (e.g., `seedFamilyRotationRules()` that inserts the 9 + 7 rows used across all tests).

A. **allowed=true on a clean bed.** Test: bed with no plantings, candidate = Brassicaceae → `{ allowed: true, penalty: 0, bonus: 0 }`. Implement: stub returning that hardcoded shape.

B. **Hard exclusion inside the window.** Test: bed had a Brassicaceae planting 3 years ago, candidate = Brassicaceae → `{ allowed: false, penalty: 0, bonus: 0, advice: 'rotation.advice.hardExclusion' }`. Implement: SQL query for past plantings, JOIN `crop`, look up `crop_family_rotation.exclusionYears`, compare against `today - exclusionYears*365`.

C. **Hard exclusion just outside the window.** Test: same setup as B but the past planting is 7 years ago → `{ allowed: true, penalty: 0, bonus: 0 }`. Implement: tighten the comparison boundary as driven by this test (the test locks the inclusive/exclusive convention; document it in a code comment).

D. **Soft penalty inside the window.** Test: bed had an Alliaceae planting 2 years ago, candidate = Alliaceae → `{ allowed: true, penalty: 25, bonus: 0, advice: 'rotation.advice.softPenalty' }`. Implement: when `exclusionYears=0` and `penaltyYears > 0` and a planting falls inside `today - penaltyYears*365`, add `ROTATION_SOFT_PENALTY`.

E. **Soft penalty just outside the window.** Test: same as D but the past planting is 5 years ago → `{ allowed: true, penalty: 0, bonus: 0 }`. Implement: tighten the soft-window boundary.

F. **No row in `crop_family_rotation` for the family.** Test: candidate family = `'unknown'` (the schema default on `crop.cropFamily`) → `{ allowed: true, penalty: 0, bonus: 0 }`. Implement: treat missing row as "no rule applies".

G. **Top-tier legume bonus.** Test: bed had a Fabaceae planting 100 days ago, candidate = Brassicaceae → `{ allowed: true, penalty: 0, bonus: -15, advice: 'rotation.advice.legumeBonus' }`. Implement: look up `family_rotation_bonus` for `(predecessorFamily='Fabaceae', successorFamily=candidate)`; the rolling-lookback check is `plantedDate >= today - 365 days`.

H. **Moderate-tier legume bonus.** Test: Fabaceae predecessor 100 days ago + Cucurbitaceae candidate → `{ allowed: true, penalty: 0, bonus: -10, advice: 'rotation.advice.legumeBonus' }`. Implement: should fall out of G's lookup automatically; if not, generalise the lookup.

I. **Legume-after-legume penalty AND soft penalty stack.** Test: Fabaceae planted 200 days ago + Fabaceae candidate → `{ allowed: true, penalty: 25, bonus: 15, advice: 'rotation.advice.legumeBonus' }`. Both signals apply: the 4-yr soft penalty for Fabaceae plus the autotoxicity bonus row. Advice key follows the bonus (legumeBonus) because it's the more specific and actionable signal. Implement: bonus + penalty stack rather than compete; advice precedence is bonus > penalty.

J. **Apiaceae candidate after Fabaceae — no bonus.** Test: Fabaceae predecessor 100 days ago + Apiaceae candidate → `{ allowed: true, penalty: 0, bonus: 0 }` (no row in `family_rotation_bonus` for this pair, so absence wins). Implement: confirm the "no row → no bonus → no advice key" path holds.

K. **Alliaceae candidate after Fabaceae — no bonus.** Test: Fabaceae predecessor 100 days ago + Alliaceae candidate → `{ allowed: true, penalty: 0, bonus: 0 }`. Same expected output as J.

L. **Bonus expires past 365 days (rolling lookback from `today`).** Test: Fabaceae planted 400 days ago + Brassicaceae candidate → `{ allowed: true, penalty: 0, bonus: 0 }` (the Fabaceae bonus is a 1-season signal that decays on a rolling basis from the candidate sowDate, not by calendar year). Implement: tighten the bonus lookback to `plantedDate >= today - 365 days` strictly.

M. **Most-recent Fabaceae wins when multiple exist within window.** Test: Fabaceae planted both 50 days ago AND 300 days ago, candidate = Brassicaceae → `{ allowed: true, penalty: 0, bonus: -15, advice: 'rotation.advice.legumeBonus' }`. The bonus magnitude is constant — it doesn't multiply with extra plantings. Implement: confirm a single row is used for the bonus calc; don't sum across rows.

N. **Multi-history bed (Fabaceae bonus + outside-window Brassicaceae).** Test: bed had Fabaceae 100 days ago AND Brassicaceae 7 years ago + Brassicaceae candidate → `{ allowed: true, penalty: 0, bonus: -15, advice: 'rotation.advice.legumeBonus' }` (Brassicaceae's hard window is 6 years, so 7-year-old planting is outside; Fabaceae bonus applies). Implement: confirm both signals coexist in the query.

O. **Hard exclusion short-circuits the bonus.** Test: bed had Fabaceae 100 days ago AND Brassicaceae 3 years ago + Brassicaceae candidate → `{ allowed: false, penalty: 0, bonus: 0, advice: 'rotation.advice.hardExclusion' }`. Implement: early-return when `allowed=false`; do not compute or report bonus when disallowed.

P. **`today` parameter is honoured (not `new Date()` internally).** Test: pass a `today` in the past, with a Fabaceae planting that would be inside-window relative to `today` but outside-window relative to `now`. Bonus must apply based on `today`, not `Date.now()`. Implement: confirm the method uses the `today` parameter throughout — no internal `Date.now()` calls.

### DDD boundary notes

- The service reads from the two new tables via the existing `this.db` injection — no new dependencies.
- No i18n string literals in this method. Return i18n keys only.
- Pure agronomic data flows in; no UI concerns; no formatting; no Swedish prose.
- `getRotationStatus` is private (used internally by `evalBedCandidate` and `evalSeedlingCandidate`). Only expose it as public if Layer 7's `getMaxedOutFamilyHints` needs to call it — at which point promote to `private` → `private` (still service-internal) and keep it out of the public API surface. (It already lives on the service; nothing exits the module.)

### Dependencies

Layers 1 + 2.

---

## Layer 4 — Wire `getRotationStatus` into the candidate builders + ranker

### Files owned

- `/Volumes/Development/self-sufficiency-garden/server/services/suggestion.service.ts` _(modified)_
- `/Volumes/Development/self-sufficiency-garden/server/services/suggestion.service.test.ts` _(modified)_

### Changes

1. Drop the call to `getRotationFamilies` from `buildBedSuggestion` (line 539).
2. In `evalBedCandidate` (line 1006) replace `if (rotationFamilies.has(c.cropFamily)) return [];` with a call to `this.getRotationStatus(loc.locationId, c.cropFamily, sowResult.sowDate)`. Note: pass `sowResult.sowDate`, NOT `today` — the rolling-365-day window measures from the candidate's sow date (Test L's contract). If `!status.allowed`, return `[]`. Otherwise attach `status.penalty`, `status.bonus`, and (if present) `status.advice` to the returned `BedCandidate`.
3. Same change in `evalSeedlingCandidate` (line 635) — replace the `rotationFamilies.has` check with the new status call, passing `readyToTransplant` as `today` (that's the equivalent "sowDate" for a transplant candidate).
4. Delete the now-unreferenced `getRotationFamilies` method and the `ROTATION_LOOKBACK_DAYS` constant.
5. Extend `BedCandidate` (line 238) with `rotationPenalty: number; rotationBonus: number; rotationAdvice?: string`. (Default 0/0/undefined when not set; don't introduce a "RotationAdjustments" lookup map — per-candidate fields match the existing `advice?: string` pattern at line 244 and avoid a new abstraction.)
6. Extend `rankByCropDemandGap` (line 1064): in the `.map((c) => {...})` block, add `rotationPenalty + rotationBonus` into the score alongside companion deltas:

   ```ts
   const score =
     baseCoverage +
     (goodNeighbor ? COMPANION_GOOD_DELTA : 0) +
     (isBad ? COMPANION_BAD_DELTA : 0) +
     c.rotationPenalty +
     c.rotationBonus;
   ```

7. Extend `formatReason` (line 1095) to append `c.rotationAdvice` (an i18n key) to `parts` after the base string. Same pattern as `advice` already does. When both `advice` and `rotationAdvice` are present, list both (rotation advice first, frost advice second — agronomic-decision ordering).

### Test-first sequence

a. **Hard-excluded candidate is dropped end-to-end.** Test against `generateBedSuggestions`: seed a bed with a Brassicaceae planting 3 years ago, wishlist a Brassicaceae crop, assert the crop does not appear in `result.crops`. Implement: switch `evalBedCandidate` to the new `getRotationStatus` check; on `!status.allowed`, return `[]`.

b. **Soft-penalty candidate is KEPT but ranked lower than a clean equivalent.** Test: two wishlist crops with identical coverage %; one's family had a recent planting (Alliaceae 2 yrs ago), the other clean. Assert the clean one comes first in `result.crops`. Implement: thread `rotationPenalty` into the score in `rankByCropDemandGap`.

c. **Soft-penalty candidate carries the `rotation.advice.softPenalty` key in `reason`.** Implement: append `rotationAdvice` in `formatReason`.

d. **Top-tier legume bonus ranks a Brassicaceae candidate ABOVE an equivalent non-Brassicaceae candidate when Fabaceae was planted in the last 365 days.** Test: two equally-covered crops, one Brassicaceae one Apiaceae, Fabaceae planted 100 days ago in the bed. Brassicaceae ranks first. Implement: thread `rotationBonus` into score (should drop out for free if (b) generalised, but Test D locks it for Brassicaceae specifically).

e. **Top-tier legume bonus surfaces `rotation.advice.legumeBonus` key in `reason`.** Implement: confirm `formatReason` includes the rotationAdvice for bonus candidates.

f. **Moderate-tier legume bonus ranks Cucurbitaceae higher than non-beneficiary (Apiaceae).** Same shape as (d) but with the −10 magnitude. Implement: confirm the moderate magnitude is honoured.

g. **Legume-after-legume: Fabaceae candidate after Fabaceae predecessor has both penalty AND bonus nonzero; ranks lower than a Fabaceae candidate on a clean bed.** Implement: confirm both signals stack and `formatReason` shows the legumeBonus key (per Layer 3 Test I).

h. **Apiaceae candidate after Fabaceae predecessor: no bonus, no advice key in `reason`** (no row in `family_rotation_bonus` → no signal). Implement: confirm no rotation advice appears for this case.

i. **Seedling transplant path also honours `getRotationStatus`.** Test via `generateBedSuggestions` with an indoor seedling whose family is hard-excluded on the target bed — candidate should not appear in `result.crops`. Implement: same swap in `evalSeedlingCandidate`.

j. **`getRotationFamilies` and `ROTATION_LOOKBACK_DAYS` are gone — soft-only family at 3 years ago no longer dropped.** Test: a 3-year-old Asteraceae planting (2-yr soft penalty window) should NOT block today's Asteraceae candidate (old 730-day blanket would have dropped it). Confirm the candidate appears with `rotationPenalty=0`. Implement: removal of the legacy code.

### DDD boundary notes

- `rankByCropDemandGap` stays a pure ranker. No new DB calls inside it. All DB work is in `evalBedCandidate` and `evalSeedlingCandidate`.
- Resist introducing a `RotationAdjustments` lookup map. Per-candidate `rotationPenalty / rotationBonus / rotationAdvice` fields on `BedCandidate` are the minimum-change pattern and match the existing `advice?: string` channel at line 244.
- `formatReason` continues to emit i18n keys; never embed Swedish text in the service.
- Pass `sowResult.sowDate` (or `readyToTransplant` for seedlings) to `getRotationStatus`, NOT `today`. The 365-day rolling window must measure from the candidate's actual sow moment — this is what makes a January candidate benefit from June's beans.

### Dependencies

Layer 3.

---

## Layer 5 — i18n strings

### Files owned

- `/Volumes/Development/self-sufficiency-garden/i18n/locales/sv.json` _(modified)_ — Swedish first.
- `/Volumes/Development/self-sufficiency-garden/i18n/locales/en.json` _(modified)_.
- `/Volumes/Development/self-sufficiency-garden/i18n/locales/da.json` _(modified)_.

### Keys (4 total — 3 advice + 1 wishlist hint)

```
rotation.advice.legumeBonus
  sv: "Bra växtföljd — ärtorna/bönorna från förra året har bidragit med kväve i jorden"
  en: "Good rotation — last year's peas/beans added nitrogen to the soil"
  da: "God sædskifte — sidste års ærter/bønner tilførte kvælstof til jorden"

rotation.advice.hardExclusion
  sv: "Undvik växtföljdsproblem — vänta längre innan denna familj återvänder"
  en: "Avoid rotation conflict — wait longer before this family returns"
  da: "Undgå sædskifteproblem — vent længere før denne familie vender tilbage"

rotation.advice.softPenalty
  sv: "Mild växtföljdsstraff — samma familj odlades nyligen i bädden"
  en: "Mild rotation penalty — same family was recently grown in this bed"
  da: "Mild sædskiftestraf — samme familie blev nyligt dyrket i bedet"

suggestions.maxedOutFamily
  sv: "Tre {family}-grödor på listan, men inga lediga bäddar — välj en eller utöka odlingen"
  en: "Three {family} crops on the wishlist but no eligible beds — pick one or expand the garden"
  da: "Tre {family}-afgrøder på listen, men ingen ledige bede — vælg en eller udvid haven"
```

Swedish copy above is a starting point — the Developer may polish to match existing voice in the locale bundle if a more natural phrasing exists. Don't invent novel phrasings; mirror existing tone.

### Test-first sequence

i. **E2E or component test: a bed page with a soft-penalty candidate renders the resolved Swedish string.** Extend the existing `/suggestions` E2E with a fixture that triggers a soft penalty. Implement: add the sv key. Then add en + da in the same commit (single-language commits are not allowed).

ii. **E2E or component test: a Fabaceae-predecessor bed renders the resolved Swedish bonus string.** Implement: add the sv/en/da keys for `rotation.advice.legumeBonus`.

(Hard-exclusion candidates are dropped from the UI flow, so their advice key never reaches the page. Cover it via a service unit test that just asserts the key is emitted from `getRotationStatus` — sufficient. Don't write an E2E for a string the user will never see.)

### DDD boundary notes

- i18n strings live ONLY in the locale JSON files. Never in the service. Never in the API response payload.
- All three language files must land in the same commit — partial translations are not allowed in this codebase.
- Family names (`Solanaceae`, `Brassicaceae`) are Latin proper nouns — they are interpolated raw into the maxed-out hint and NOT translated.

### Dependencies

Layer 4 (the service must already be emitting the keys before the UI can resolve them).

---

## Layer 6 — API surface

### Files owned

- `/Volumes/Development/self-sufficiency-garden/server/api/suggestions/bed.get.ts` _(verify only — likely no changes for the rotation advice flow; see Layer 7 for the maxed-out field)_.
- `/Volumes/Development/self-sufficiency-garden/tests/integration/api/suggestions.test.ts` _(modified — new integration test)_.

The existing `reason` field on `CropOption` already carries advice strings; the new advice keys flow through it without an API shape change. Confirm this with one integration test.

### Test-first sequence

p. **Integration test: `GET /api/suggestions/bed` against a household with a Fabaceae-predecessor bed and a wishlisted Brassicaceae crop returns at least one candidate whose `reason` contains the i18n key `rotation.advice.legumeBonus`.** Implement: should pass out of the box if Layer 4 is right; if not, fix the wire-up.

### DDD boundary notes

- API handlers stay thin — they call the service and return the result. No business logic added here.
- The API returns i18n keys in the `reason` field, same as it does for `frostGate.advice.requiresFiberduk` today. Client resolves them.

### Dependencies

Layer 4.

---

## Layer 7 — Wishlist "Maxed out family" hint

### Files owned

- `/Volumes/Development/self-sufficiency-garden/server/services/suggestion.service.ts` _(modified)_ — new method `getMaxedOutFamilyHints(householdId, today)` returning `Array<MaxedOutHint>`; **change `generateBedSuggestions` return type** from `Promise<BedSuggestion[]>` to `Promise<{ suggestions: BedSuggestion[]; maxedOutFamilies: MaxedOutHint[] }>`.
- `/Volumes/Development/self-sufficiency-garden/server/services/suggestion.service.test.ts` _(modified)_ — update existing `generateBedSuggestions` tests that destructure the response.
- `/Volumes/Development/self-sufficiency-garden/server/api/suggestions/bed.get.ts` _(modified)_ — handler stays thin, returns the new wrapped object.
- `/Volumes/Development/self-sufficiency-garden/app/pages/suggestions.vue` _(modified)_ — update consumer to destructure `{ suggestions, maxedOutFamilies }`; render the hint banner.
- `/Volumes/Development/self-sufficiency-garden/tests/integration/api/suggestions.test.ts` _(modified)_ — update existing integration tests that destructure `bed.get.ts` response.
- `/Volumes/Development/self-sufficiency-garden/tests/e2e/suggestions-maxed-out.spec.ts` _(new E2E)_.
- **Check for additional consumers** before starting: `grep` for `/api/suggestions/bed`, `generateBedSuggestions`, and `useFetch.*suggestions/bed` across `app/` and `tests/`. Update every destructure site in the same commit (breaking change must land atomically).

### API shape (locked)

`generateBedSuggestions` and `GET /api/suggestions/bed` both return:

```ts
type MaxedOutHint = {
  family: string; // raw Latin family name, e.g. 'Solanaceae'
  wishlistCount: number; // how many wishlist rows belong to this family
};

type BedSuggestionsResponse = {
  suggestions: BedSuggestion[]; // formerly the bare array
  maxedOutFamilies: MaxedOutHint[];
};
```

This is a deliberate breaking change. Rationale (coordinator decision): solo-dev homelab app; frontend + tests are the only consumers; a separate endpoint would be over-engineering. Matches the existing `getBedNudges` pattern which already wraps its return in `{ daysUntilFrost, beds }`.

### Trigger logic (per BACKLOG)

A family is "maxed out" when BOTH of these are true:

1. The household's wishlist contains ≥ 3 crops of that family.
2. No bed in the household currently has that family allowed — i.e. for every bed, `getRotationStatus(bedId, family, today).allowed === false`.

Note the agronomic subtlety: "no bed has it allowed" is the rotation check. The BACKLOG also mentions "or none in the sow-window", but the sow-window check is already part of `evalBedCandidate` and the candidate would simply not appear in `result.crops`. For Layer 7 the simpler "rotation allows" check is the right signal — if rotation says no, the family is genuinely maxed.

### Test-first sequence

q. **Wishlist has 3 Solanaceae crops; every bed hard-excludes Solanaceae → returns `[{ family: 'Solanaceae', wishlistCount: 3 }]`.** Implement: walk wishlist, group by family, count families with ≥ 3 entries, for each candidate family walk beds and check `getRotationStatus`. Return only families with no eligible bed.

r. **Wishlist has 3 Solanaceae crops; one bed allows Solanaceae (no recent Solanaceae history) → returns `[]`.** Implement: short-circuit when ANY bed returns `allowed: true`.

s. **Wishlist has 2 Solanaceae crops; all beds excluded → returns `[]`.** Under-threshold case. Implement: confirm the ≥ 3 filter.

t. **Wishlist has 3 Solanaceae AND 3 Brassicaceae, both blocked across all beds → returns both families.** Implement: confirm the method handles multiple maxed families.

u. **Empty wishlist → returns `[]`.** Implement: confirm no errors thrown on empty input.

v. **Wishlist has 3 Solanaceae but household has zero beds → returns `[{ family: 'Solanaceae', wishlistCount: 3 }]`.** Edge case: no beds means no allowed beds, which is "maxed out" by definition. Implement: confirm the empty-beds branch.

w. **Service test: `generateBedSuggestions` now returns the wrapped shape.** Test: existing fixture returns `{ suggestions: [...], maxedOutFamilies: [...] }` instead of a bare array. Implement: change the return type and update internal call sites (`getBedNudges` at line 1155 destructures via `await this.generateBedSuggestions(...)` — update it to `.suggestions`). Update every existing service test that destructures the result.

x. **Integration test: `GET /api/suggestions/bed` returns `{ suggestions, maxedOutFamilies }`.** Implement: thin handler wires through the wrapped shape; update existing integration tests that assumed a bare array.

y. **E2E: seed 3 Solanaceae wishlist rows + a Solanaceae planting in the only bed (which hard-excludes), load `/suggestions`, assert the `suggestions.maxedOutFamily` banner appears with `Solanaceae` interpolated.** Implement: update `app/pages/suggestions.vue` to destructure the new shape; add the banner component wired to `maxedOutFamilies`.

z. **Regression check: existing `/suggestions` E2E still passes** with no maxed-out families (banner absent when `maxedOutFamilies` is empty). Implement: confirm the banner conditionally renders only when the array is non-empty.

### DDD boundary notes

- The hint lives on `SuggestionService` (it's an agronomic decision, not a UI concern). The Vue page only displays.
- Family name interpolation is a UI concern; the API returns the raw family string (`'Solanaceae'`) and the page renders it. Don't translate the family name itself.
- The banner placement should match an existing banner pattern in `/suggestions` — do NOT introduce a new component if a similar one already exists. (Researcher question: scan for existing banner components on `/suggestions` before building.)
- `getMaxedOutFamilyHints` is a public method on `SuggestionService` (callable from API). All other rotation logic stays private.

### Dependencies

Layer 4 (depends on `getRotationStatus` being wired in).

---

## Layer 8 — Final cleanup + regression sweep

### Files owned

No new files; verification pass.

### Checks

- Confirm `getRotationFamilies` and `ROTATION_LOOKBACK_DAYS` are removed (`grep` the codebase to be certain).
- Confirm `pnpm test:coverage` passes the 80% floor. The new `getRotationStatus` and `getMaxedOutFamilyHints` methods should sit at or near 100% from the increments above.
- Confirm `pnpm typecheck` is clean.
- Confirm `pnpm lint` is clean.
- Confirm `pnpm test:e2e` passes including the new `suggestions-maxed-out.spec.ts`.
- Update the BACKLOG checkboxes for "Family rotation refinement" — all 8 boxes should now be ticked.

### Dependencies

Layers 1–7.

---

## Test contracts (for QA Engineer)

Service-level method signatures the QA agent should drive tests against:

```ts
// Layer 3 — new
private getRotationStatus(
  locationId: number,
  candidateFamily: string,
  today: Date,
): {
  allowed: boolean;            // false → drop the candidate
  penalty: number;             // 0 or 25
  bonus: number;               // 0, -15, -10, or +15
  advice?: 'rotation.advice.legumeBonus'
         | 'rotation.advice.hardExclusion'
         | 'rotation.advice.softPenalty';
};

// Layer 7 — new
async getMaxedOutFamilyHints(
  householdId: number,
  today: Date,
): Promise<Array<{ family: string; wishlistCount: number }>>;
```

### Edge cases worth covering across both methods

- Family name not in `crop_family_rotation` → treat as no-rule, return `allowed: true` / no maxed-out signal.
- `today` exactly on the boundary day of a window — write a test to lock the inclusive/exclusive convention; document it in a code comment.
- `crop.cropFamily = 'unknown'` (the schema default) — must never crash and must never trigger an exclusion or bonus.
- Empty household (no plantings, no wishlist) — no errors thrown by either new method.
- Multiple plantings of the same family in the bed at different ages — most recent wins for the bonus check (Layer 3 Test M).
- `today` parameter must be honoured throughout — no internal `Date.now()` calls in either method (Layer 3 Test P).

---

## Open questions (for Researcher)

1. **Cucurbitaceae source URL.** Research doc §7 cites "PNW Pest Handbooks" but the closest URL is for onion white rot. Find the canonical Cucurbit-Fusarium PNW page, or confirm we fall back to a Bayer / extension page that's explicitly cited.
2. **Banner placement on `/suggestions`.** The "maxed out family" hint — top of `/suggestions`, inside the per-bed card list, or as part of the existing "how it works" explainer? Scan for existing banner components on `/suggestions` first; pick the one that matches an existing pattern. Do not introduce a new banner component if one is already in use.

---

## Reminders to stamp into every QA + Developer prompt

- **Per-behavior Red-Green only.** One failing test, then minimum code, then green, then next test. Never write a second test until the first is green. Never write production code that is not driven by an already-red test.
- **Every new seed row carries a `source` URL** drawn from `family-rotation-research.md` §7.
- **Service emits i18n KEYS** (not Swedish text); locale files own the strings.
- **No new abstractions when an existing one will do** — `BedCandidate` already carries an `advice?: string`; reuse that channel pattern (`rotationAdvice?: string`) rather than introducing a `RotationAdjustments` map.
- **Coverage target:** close to 100% on the two new service methods; 80% floor is enforced by CI but not the goal.
- **Migrations:** any new column or table needs schema change + idempotent `MIGRATIONS_SQL` entry + mirror in `test-utils/create-test-db.ts`. No exceptions.
- **All three locale files (sv/en/da)** land in the same commit. No partial translations.
