# Backlog — Autarki

## Up next

Well-defined, ready-to-build work. Pick from here when starting a new feature.

### Households, Pocket ID login and invite links ✅

> Garden goes from one-instance-one-household to many users. Login through Pocket ID (OIDC), like runplan. Every account gets its own household on first login and owns it. An invite link lets someone join another household; logging in for the first time through an invite link joins only that household. A user can belong to several households and switch between them. Members can edit everything; only the owner rotates the link, removes members, resets and deletes the household. The activity log is per household; crops, seed varieties and macro presets stay global. Existing data is not migrated (fresh `app.db`). `AUTH_MODE=dev` skips login for local dev and e2e.

- [x] Schema: `app_user`, `session`, `household_member` (role owner/member), `household.invite_code`, `activity.household_id` (+ seed.ts TABLES/MIGRATIONS, test DB DDL)
- [x] `loadAuthConfig(env)`: AUTH_MODE dev/oidc, OIDC_*, PUBLIC_URL
- [x] `AuthService`: upsert user from OIDC claims, sessions with expiry, dev user
- [x] `MembershipService`: own household on first login, list/active household, join by code, rotate code, members, remove/leave, owner checks
- [x] Scope guard: every id in route params, query and body (`householdId`, `locationId`, `plantingId`, `targetLocationId`, `/api/<entity>/:id`) must belong to the active household → 404/403
- [x] List endpoints without a householdId (plantings, locations, storage, activity) filter by the active household
- [x] Activity log written and read per household; reset only clears that household's log
- [x] Nitro middleware: 401 without session, active household from cookie (falls back to the first membership)
- [x] `/api/auth/login|callback|logout|me` with `returnTo`; `/api/invite/:code` preview + join
- [x] Frontend: auth redirect, `/api/household/current` instead of `households[0]`, switcher, household page with invite link / members / leave / delete, `/join/:code` page, logout
- [x] i18n sv/en/da for all new strings
- [x] E2E in dev auth mode; docs, `.env.example`, compose example with Pocket ID

### Season-proof suggestion e2e

> 10 tests in `tests/e2e/suggestions.spec.ts` depend on today's date (e.g. spinach sown April–June, first frost mid-October) and fail from autumn onward. They are quarantined with `test.fixme` so CI in app-suite stays green.

- [ ] Inject a clock into the suggestion services (default `() => new Date()`), with unit tests
- [ ] Let e2e set the server's "today" in test mode (env var or test-only endpoint)
- [ ] Pin the suggestion e2e tests to a fixed in-season date and remove `test.fixme`

### Drawing map — deferred-commit paint + pan/zoom + hover bug ✅

> Three independent pain points on `/garden`, grilled together because they all touch `useGardenCanvas.ts`:
>
> 1. **Lifting the pointer auto-commits**. Painting a few cells immediately pops the tag sheet — no room to lift-and-look or refine the selection.
> 2. **Hovering opens the bed popover**. `watch(hoveredBedId)` in `GardenCanvas.vue:44-48` fires on `pointermove`, so just passing the mouse over a bed pops the popover (with real actions inside). On touch the same path fires during pan.
> 3. **Paint mode swallows all gestures**. No two-finger pan, no pinch-zoom, no middle-mouse pan. The `+ / -` buttons in the toolbar are wired to `() => {}` in `garden.vue:242-243` and do nothing on mobile.

**Locked design**

- Beds: paint mode strokes accumulate into a pending selection (semi-transparent neutral fill + dashed border). Toolbar hides on first stroke; floating `[✓] [✕]` appears over the selection. `✓` opens the existing tag sheet (color palette only renders when the bed has no color yet). `✕` clears selection, restores toolbar.
- Decoratives + erase: unchanged (commit-per-stroke; their target is pre-armed in the toolbar so there's no decision to defer).
- View-mode popover trigger: explicit click/tap only. Remove the `hoveredBedId` assignment inside `handlePointerMove`; rename to `selectedBedId`. No hover tooltip.
- Gestures: 1-finger paint, 2-finger pan + pinch-zoom (paint pauses while 2 pointers down, resumes on next 1-finger stroke), middle-mouse pan on desktop. Wire the `zoom-in` / `zoom-out` events through to `useGardenCanvas.zoomIn / zoomOut`.
- Zoom sensitivity: pinch must feel like a precision dial, not a slingshot. Use the live two-finger distance ratio dampened with a gain factor (≤ 0.5 — i.e. a 4× distance change yields ≤ 2× zoom) and clamp per-frame delta to a small range. `zoom.value` already accepts floats; keep sub-pixel zoom on. Wheel keeps its existing 3 % step.

**Tasks**

- [x] **Hover bug — unit tests (Red)** in `useGardenCanvas` exposed test points: hovering does NOT mutate `selectedBedId`; clicking on a bed in view mode DOES.
- [x] **Hover bug — fix**: rename `hoveredBedId` → `selectedBedId`. Stop setting it inside `handlePointerMove`. Keep it set in `handleClick`. Update `GardenCanvas.vue`'s `watch` accordingly (still emits `bed-click`, name preserved at the emit boundary).
- [x] **Hover bug — E2E** (`tests/e2e/garden-popover-trigger.spec.ts`): paint a small bed via canvas dispatch (or seed via API), enter view mode, hover the canvas → popover stays closed; click → popover opens.
- [x] **Pending-selection state — composable**: add a `pendingSelection: Ref<Set<string>>` and `commitPendingSelection / clearPendingSelection / hasPendingSelection` to `useGardenCanvas`. Paint strokes (when `mode === 'paint'` AND no decorative armed) add into `pendingSelection` instead of `selectedCells`. Decorative + erase paths unchanged.
- [x] **Pending-selection render**: in `render()`, draw cells in `pendingSelection` with 40 %-alpha indigo fill + dashed 1.5 px outline. Add Vitest coverage in `useGardenCanvasUtils.test.ts` for a new pure helper that returns the fill style for a pending cell (so the visual rule is unit-tested even though the canvas itself is not).
- [x] **Floating action UI**: new component `GardenPendingActions.vue` rendering `[✓ Klar]` and `[✕ Avbryt]` pills, absolutely positioned over the centroid of the pending selection (computed from the cell set + zoom + offset). Hides when `pendingSelection.size === 0`.
- [x] **Toolbar hide**: pass a `pendingActive` prop into `GardenToolbar.vue`; when true, render `null` (or fade out). In `garden.vue`, derive from the canvas's `pendingSelection.size > 0`.
- [x] **Wire commit / cancel**: `✓` → open the existing `GardenTagSheet` with the pending cells; on tag, write into `layout.cells` and clear pending. `✕` → clear pending only. Keep `pushSnapshot` on commit so undo restores prior layout.
- [x] **Decorative regression guard**: keep current behaviour when `decorativeType !== null` — auto-tag on `paintEnd`, no pending state. Cover with an existing decorative-paint test (`garden.spec.ts` or a new one).
- [x] **Two-pointer pan + pinch-zoom**: track active `pointerId`s in `useGardenCanvas`. When a second pointer goes down: cancel any in-progress paint stroke (move the cells just added back out of `pendingSelection` if the user really only wanted to pan — simpler: leave them; this matches Procreate-style behaviour). Compute midpoint + distance each move; pan by midpoint delta, zoom by `(currentDistance / startDistance) ** GAIN` where `GAIN ≈ 0.5`. Clamp the per-event multiplier to `[0.95, 1.05]` for jitter resistance.
- [x] **Middle-mouse pan**: in `handlePointerDown`, if `e.button === 1` set `isPanning = true` regardless of mode.
- [x] **Wire zoom buttons**: replace the `() => {}` stubs in `garden.vue:242-243` with calls into the canvas's `zoomIn` / `zoomOut`. Add a unit test in `useGardenCanvasUtils` for a `dampenZoomFactor(rawRatio, gain)` pure helper so the gain math is locked.
- [x] **E2E (`tests/e2e/garden-paint-flow.spec.ts`)**: paint a bed via canvas pointer events, confirm toolbar disappears and `[✓] [✕]` appear; click `✕` → toolbar returns, no cells committed; paint again, click `✓` → tag sheet opens; pick a location → cells committed.
- [x] **i18n**: `garden.pending.commit` ("Klar"), `garden.pending.cancel` ("Avbryt") in sv/en/da. Reuse existing tag-sheet strings.

**Out of scope**

- Global `cellSizeCm` recalibration (bedrooms-to-stadiums note in `garden.vue:87`) — separate backlog entry when it bites.
- Hover tooltip with bed name — explicitly dropped during grilling.
- Per-bed color editing UI from the toolbar — color picker stays in the tag sheet at first-tag time.

### Dismissal expiry (90 days) + clear-all button ✅

> Dismissals from the suggestion engine should not suppress crops forever — a 90-day expiry window makes suggestions self-healing. A "clear all dismissals" button on `/suggestions` gives the user a manual escape hatch.

- [x] **Schema**: add `dismissed_at TEXT` column to `garden_event` in `server/db/schema.ts`
- [x] **Migration**: `ALTER TABLE garden_event ADD COLUMN dismissed_at TEXT` in `MIGRATIONS_SQL` in `server/plugins/seed.ts`
- [x] **`create-test-db.ts`**: add `dismissed_at TEXT` column to in-memory DDL
- [x] **Unit tests (Red)**: write failing tests for `GardenEventService.dismiss()` (sets `dismissedAt`), `SuggestionService.getDismissedPairs()` (expiry logic), `SuggestionService.clearDismissals()` (returns count)
- [x] **`GardenEventService.dismiss()`**: set both `status: 'dismissed'` AND `dismissedAt: new Date().toISOString()`
- [x] **`SuggestionService` — expiry constant + `getDismissedPairs()`**: add `DISMISSAL_EXPIRY_DAYS = 90`; active window = `dismissedAt >= (today - 90 days)` OR `dismissedAt IS NULL` (legacy rows treated as permanent)
- [x] **`SuggestionService.clearDismissals(householdId)`**: new method; updates dismissed events to 'completed', returns `{ cleared: number }`
- [x] **Integration test**: `DELETE /api/suggestions/dismissals` hits real DB, verifies cleared count and DB state
- [x] **`DELETE /api/suggestions/dismissals`**: thin handler calling `SuggestionService.clearDismissals(householdId)`
- [x] **i18n keys**: `suggestions.clearDismissals`, `suggestions.clearDismissalsConfirm`, `suggestions.clearDismissalsSuccess` in sv/en/da
- [x] **Frontend button** on `app/pages/suggestions.vue`: confirm dialog → call `DELETE /api/suggestions/dismissals` → re-fetch suggestions
- [x] **E2E test**: button visible, confirm clears dismissals, suggestions reappear

### Smart frost gate ✅

> Today's frost gate is binary: harvest must finish before `firstFrost` or the candidate is dropped. This silently rejects suggestions the user could realistically grow with the tools an experienced gardener actually uses (frost-tolerant crops, polytunnels, fiberduk on cold nights). Replace it with a **SAFE / STRETCH / IMPOSSIBLE** classification that surfaces actionable advice in the suggestion's reason text. Symmetric at both ends of the season.
>
> **Temperature-based model**, not days. No reputable source publishes "days past first frost" per crop — they publish minimum survivable °C. See `frost-tolerance-research.md` at the repo root for the full sourcing audit.
>
> Hard requirement: every numeric default carries a citation. Primary source: Sustainable Market Farming's _Winter-Kill Temperatures of Cold-Hardy Vegetables_ (empirical, annual). Cross-references: Cornell, RHS hardiness bands, Eliot Coleman.

**Model** — see [[FrostTolerance]] in `ubiquitous_language.md` for the canonical concept.

- `crop.minTempC: integer` (default 0) — minimum outdoor air temperature (°C) the crop survives. Sample values per Sustainable Market Farming: tomat 0, basilika 0, sallat -6, ruccola -6, mangold -9, grönkål -9, kålrabbi -9, spenat -12, purjo -11, mâche -18, palsternacka -18.
- `growingLocation.frostBufferC: integer` (default 0) — degrees of insulation from permanent protection on this bed. Open ground 0; row cover +1; cold frame +2; polytunnel +3; unheated greenhouse +5; heated greenhouse special-cased (effectively unbounded but light-limited — out of scope for v1).
- `FIBERDUK_BONUS_C = 2` constant in code (not stored). When a candidate would only be SAFE _with_ fiberduk, the engine still surfaces it as STRETCH with advice text `"täck med fiberduk vid frostnatt"`. Self-honesty contract — engine assumes user will deploy when needed.

**New runtime helper** — `getExpectedMinTempC(zone, date) → number` in `server/utils/growing-zones.ts`. Built on top of the existing `getZoneFrostDates(zone)` endpoints + SMHI 1991–2020 normal monthly means. Piecewise approach for v1: linear from 0°C at `lastFrostDate` through a zone-specific winter low (e.g., zone 1 winter low ≈ -2°C; zone 8 ≈ -15°C; sourced from SMHI normalkartor) back to 0°C at `firstFrostDate` of the following year. Summer = > 0 always. Refine the curve shape later if it matters. ~30 lines.

**Tiered gate** (applied symmetrically at sow date AND harvest date — candidate's tier = worst of the two)

```ts
function classifyAtDate(date, crop, location, zone):
  expectedMin   = getExpectedMinTempC(zone, date)
  withLocation  = expectedMin + location.frostBufferC
  withFiberduk  = expectedMin + location.frostBufferC + FIBERDUK_BONUS_C

  if (withLocation >= crop.minTempC):                  return SAFE
  if (withLocation + FIBERDUK_BONUS_C >= crop.minTempC): return STRETCH("kräver fiberduk vid frostnatt")
  return IMPOSSIBLE
```

The candidate's reason text picks the worse tier's advice. Hardy crops never reach STRETCH because `expectedMin` rarely drops below their `minTempC` in normal sowing windows; only autumn-finishing harvests of mid-hardy crops or aggressive spring sowings of tender crops will see STRETCH.

**Tasks**

- [x] **Schema** — two columns: `crop.minTempC` (integer, default 0) and `growingLocation.frostBufferC` (integer, default 0). Drizzle schema + idempotent `ALTER TABLE`s in `MIGRATIONS_SQL` + mirror in `test-utils/create-test-db.ts`.
- [x] **`getExpectedMinTempC(zone, date)`** — new utility in `server/utils/growing-zones.ts`. Add `ZONE_WINTER_LOW_C: Record<number, number>` const map (zones 1–8 → January min °C from SMHI normalkartor 1991–2020, sourced inline per row, mirrors the `ZONE_FROST_DATES` pattern at `:6`). Pure piecewise-linear curve through `lastFrostDate / midwinter / firstFrostDate` endpoints. **No live SMHI calls** — normals are decadal static data, refresh once per `normalperiod` update. Pure function, unit-tested.
- [x] **Seed `crop.minTempC`** for all crops in `seed-data.ts` with `// source: <URL>` inline comments. Tender crops default to 0; hardy crops sourced individually from Sustainable Market Farming with cross-refs where available. _(Phase 2)_
- [x] **Location UI** — single dropdown on the location create/edit form: Open ground / Row cover / Cold frame / Polytunnel / Unheated greenhouse. Picking one stores `frostBufferC` under the hood from a sourced preset table (open=0, row=+1, frame=+2, tunnel=+3, greenhouse=+5). _(Phase 3)_
- [x] **i18n** — protection-level labels + advice strings in sv/en/da. Sv first: `Öppen mark`, `Fiberduk över bädd`, `Drivbänk`, `Polytunnel`, `Växthus (ouppvärmt)` + the STRETCH advice `Kräver fiberduk vid frostnatt`. _(Phase 3)_
- [x] **`classifyFrostTier(crop, location, zone, sowDate, harvestDate)`** in `SuggestionService` — new helper returning `{ tier: 'safe' | 'stretch' | 'impossible', advice?: string }`. Calls `classifyAtDate` for both endpoints and returns the worse tier.
- [x] **Replace hard gate in `SuggestionService`** — `buildBedCandidates` + `buildSeedlingTransplantCandidates` swap the binary `if (harvestReadyDate > firstFrost) continue;` for the new classifier. IMPOSSIBLE drops, SAFE/STRETCH keep, STRETCH appends advice to `reason`.
- [x] **`FIBERDUK_BONUS_C = 2`** constant alongside `DISMISSAL_EXPIRY_DAYS` in `suggestion.service.ts`.
- [x] **TDD coverage** — unit tests for `getExpectedMinTempC` (frost endpoints, winter low, summer high). Unit tests for `classifyAtDate` covering all three tier transitions. Service-level tests: hardy crop in autumn accepted, tender crop in early spring dropped, location buffer pushes borderline crop into SAFE, fiberduk advice appears only in STRETCH and only when needed. Integration test that `/api/suggestions/bed` returns the advice in `reason`. E2E deferred to Phase 3 (no UI yet).

**Sources** (every seeded `minTempC` value must cite one of these inline)

- [Pam Dawling — Winter-Kill Temperatures of Cold-Hardy Vegetables 2021](https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/) — primary, empirical, ~30 crops with variety-specific notes
- [Winter-Kill Temperatures 2020](https://www.sustainablemarketfarming.com/2020/03/10/winter-kill-temperatures-of-cold-hardy-vegetables-2020/) — corroborating, year-over-year
- [Winter-Kill Temperatures 2018](https://www.sustainablemarketfarming.com/2018/01/23/winter-kill-temperatures-of-cold-hardy-vegetables-2018/) — corroborating
- [Eliot Coleman — _The Winter Harvest Handbook_](https://www.chelseagreen.com/product/the-winter-harvest-handbook/) — qualitative + temperature data for cold-hardy crops under protection
- [RHS Hardiness Ratings (PDF)](https://www.rhs.org.uk/plants/pdfs/rhs-hardiness-rating.pdf) — coarse 5°C bands H1a–H7, useful as a sanity check
- [Johnny's Selected Seeds Winter Growing Guide](https://www.johnnyseeds.com/growers-library/methods-tools-supplies/winter-growing-season-extension/library-vegetables-first-last-to-market.html) — practical season-extension knowledge
- [Botanical Interests — Frost Tolerance of Vegetables](https://www.botanicalinterests.com/community/blog/frost-tolerance-of-vegetables/) — beginner-accessible cross-reference
- [SMHI Normalperioden 1991-2020](https://www.smhi.se/kunskapsbanken/klimat/normaler/normalperioden-1991-2020) — Swedish monthly temperature normals for the zone-curve helper
- [SMHI Normalkartor — Månadsmedeltemperatur](https://www.smhi.se/klimat/klimatet-da-och-nu/normalkartor/normal/manadsmedeltemperatur-normal/alla-manader/1991-2020) — monthly mean temperature maps

**Out of scope**

- Per-household `hasFiberduk` flag — fiberduk is advice, not capability.
- Heated greenhouse light-limit modelling (December has ~6h daylight in Stockholm regardless of temperature — warm-season crops can't grow even with heat). Treat as `frostBufferC = +12` for v1 and revisit if it bites.
- Live forecast integration with SMHI's API — using 30-year normals only.
- Per-crop variety-specific tolerance (some kale varieties are hardier than others). Single `minTempC` per crop; varietal nuance lives in [[SeedVariety]] if ever needed.
- Family rotation refinement — separate feature, see its own entry below in Up next.

### Family rotation refinement ✅

> Today's rotation rule is a flat 730-day blanket lookback (`ROTATION_LOOKBACK_DAYS`) that drops any candidate sharing a family with anything planted in the bed in the last 2 years. This is **dangerously lenient for some families** (clubroot persists up to 20 years in Brassicaceae; white rot 20–40+ years in Alliaceae) and **pointlessly strict for others** (lettuce-after-lettuce is fine after one season). Replace with a per-family rule set that does hard exclusion for high-disease-risk families, soft ranking penalty for mid-risk, and a **legume-predecessor bonus** that surfaces "you planted beans here last year — fill it with a heavy feeder to eat all that fixed nitrogen 🌱".
>
> Hard requirement: every numeric value in the seed tables must carry a `source` URL. Full sourcing audit lives at `/family-rotation-research.md` at repo root — values below are the audited final picks.

**Per-family rules (sourced — see `family-rotation-research.md` for full rationale)**

| Family                                              | Hard exclusion | Soft penalty window | Driver                                                             |
| --------------------------------------------------- | -------------- | ------------------- | ------------------------------------------------------------------ |
| Brassicaceae (kål, broccoli, kale, rädisa, ruccola) | **6 yrs**      | —                   | Clubroot persists up to 20 yrs (Jordbruksverket)                   |
| Alliaceae (lök, vitlök, purjo, gräslök)             | —              | **4 yrs**           | White rot 20–40+ yrs — hygiene > rotation; soft only (RHS, UC IPM) |
| Solanaceae (potatis, tomat, paprika, aubergine)     | **4 yrs**      | —                   | Verticillium 7–14 yrs; matches Coleman (NC State, Coleman Ch.7)    |
| Cucurbitaceae (gurka, pumpa, squash)                | —              | **3 yrs**           | Fusarium 4–5 yrs (PNW Pest Handbooks)                              |
| Apiaceae (morot, palsternacka, dill)                | —              | **2 yrs**           | Carrot fly + Sclerotinia 3–5 yrs (RHS, Missouri IPM)               |
| Chenopodiaceae (rödbeta, mangold, spenat)           | —              | **3 yrs**           | Cercospora 3 yrs in debris (Cornell CCE)                           |
| Fabaceae (ärt, böna, bondböna)                      | —              | **4 yrs**           | Aphanomyces 10+ yrs + autotoxicity (NDSU, PNW)                     |
| Asteraceae (sallat, endive)                         | —              | **2 yrs**           | Sclerotinia 3–5 yrs (Missouri IPM)                                 |
| Poaceae (majs, råg, vete)                           | —              | **2 yrs**           | Corn smut 4 yrs in soil (UMN Extension)                            |

**Legume-predecessor bonus** (two-tier, the high-leverage one ⭐):

- Predecessor: Fabaceae (in the previous growing year)
- Top tier (−15 pp, matches `COMPANION_GOOD_DELTA`): **Brassicaceae, Solanaceae** — highest N demand (200–400 kg N/ha), primary beneficiaries in Coleman's 8-part sequence
- Moderate tier (−10 pp): **Cucurbitaceae, Poaceae, Chenopodiaceae, Asteraceae** — moderate N demand
- Excluded (0 pp): **Apiaceae** (residual N → forked roots in carrots), **Alliaceae** (low-medium N demand, not a primary beneficiary)
- Legume-after-legume penalty: **+15 pp** when Fabaceae follows Fabaceae — autotoxicity (Assaduzzaman & Asao 2011)
- Advice text on the suggestion: `"Bra växtföljd — ärtorna/bönorna från förra året har bidragit med kväve i jorden"`

**Scoring constants** (align with existing companion scale at `suggestion.service.ts:211-212`):

```ts
ROTATION_SOFT_PENALTY = +25; // matches COMPANION_BAD_DELTA
LEGUME_BONUS_HIGH = -15; // matches COMPANION_GOOD_DELTA (Brassicaceae, Solanaceae)
LEGUME_BONUS_MODERATE = -10; // Cucurbitaceae, Poaceae, Chenopodiaceae, Asteraceae
LEGUME_AFTER_LEGUME_PENALTY = +15; // autotoxicity signal
```

**Schema**

```ts
crop_family_rotation {
  family: text PK,                  // 'Brassicaceae', etc.
  exclusionYears: integer,           // hard cutoff (0 = soft only)
  penaltyYears: integer,             // soft window for ranking
  source: text NOT NULL,
  sourceNote: text,
}

family_rotation_bonus {
  predecessorFamily: text,
  successorFamily: text,
  bonusScore: integer,               // negative = ranks higher (bonus), positive = ranks lower (penalty)
  source: text NOT NULL,
}
```

`penaltyScore` is intentionally **not** on `crop_family_rotation` — the value is the single `ROTATION_SOFT_PENALTY` constant in code (matches how `COMPANION_BAD_DELTA` lives in code, not the DB). `family_rotation_bonus` keeps its own per-row magnitude because the two-tier legume bonus needs row-level variation (−15 / −10 / +15).

Both seeded with `onConflictDoNothing()` like the existing crop seed.

**Tasks**

- [x] **Research** — sourced per-family rule audit at `/family-rotation-research.md` (2026-05-27). Final values + scoring constants locked.
- [x] **Schema** — two tables above. Drizzle schema + `TABLES_SQL` + idempotent `CREATE TABLE IF NOT EXISTS` in `MIGRATIONS_SQL` + mirror in `test-utils/create-test-db.ts`.
- [x] **Seed** — rows per the audited values with sourced `source` URLs from the research doc. One row per family for `crop_family_rotation`; rows per Fabaceae→successor pairing for `family_rotation_bonus` (top-tier −15, moderate −10, legume-after-legume +15).
- [x] **Service refactor** — replace `getRotationFamilies(locationId, today)` with `getRotationStatus(locationId, candidateFamily, today)` returning `{ allowed: boolean, penalty: number, bonus: number, advice?: string }`. Reads from the two new tables. Single SQL query for past plantings + JOIN to crop family.
- [x] **`buildBedCandidates` + `buildSeedlingTransplantCandidates`** — drop hard `if (rotationFamilies.has(c.cropFamily)) continue;` in favour of `if (!status.allowed) continue;`. Pipe `penalty` and `bonus` through to `rankByCropDemandGap`.
- [x] **`rankByCropDemandGap`** — accept a `RotationAdjustments` map keyed by `cropId` with `{ penalty, bonus }`. Apply alongside the existing companion deltas. Bonus surfaces in `reason` text when nonzero.
- [x] **i18n advice strings** — `Bra växtföljd — ärtorna gödslade jorden`, `Undvik klumprotsjuka — vänta X år`, `Mild växtföljdsstraff — sista odling X år sedan` in sv/en/da.
- [x] **TDD coverage** — service-level unit tests for each branch: hard-exclusion drops candidate, soft-penalty within window adds score, soft-penalty outside window is 0, legume bonus subtracts score, legume-bonus advice text appears, mixed predecessor (legume + other) still applies bonus. Integration test that `/api/suggestions/bed` returns the bonus advice in `reason`. E2E that a "bra växtföljd" advice renders on `/suggestions`.
- [x] **"Maxed out" wishlist hint** — when the wishlist contains 3+ members of a family but no bed is currently eligible (all blocked by hard-exclusion or none in the sow-window), surface a one-line note on `/suggestions` ("Tre solanaceae-grödor på listan, men inga lediga bäddar — välj en eller utöka odlingen"). i18n sv/en/da + E2E.

**Out of scope**

- "White-rot-ever-seen" flag → permanent block. Future feature; today's model assumes no history.
- Cover-crop rotation (rye, clover, etc.) — needs a separate `cover_crop_planting` concept; revisit if cover cropping enters the app.
- Inter-family interactions beyond legume-fixation (e.g. allelopathy from sunflowers, walnut juglone) — too niche; surfacing later if user requests.

<!-- Wishlist demand model — weekly + yearly — moved to Done. -->

### Companion-aware suggestions ✅

> Make crop adjacency a visible, actionable decision factor. Drives the "garden as a live place, always add more life" north star by surfacing which crops pair well with what you're already growing — first as info on the planting detail page, then as a bonus the suggestion engine actually consumes.
>
> Static growing tips (pruning, watering, etc.) deliberately deferred — they're reference material, not behaviour-changing. Pivoting that effort into companion data + succession-planting awareness instead.

**Phase 1** — data foundation + planting detail card ✅

- [x] **Add 7 missing crops** to `seed-data.ts`: Basilika, Dill, Persilja, Gräslök (all high-leverage for companion planting), Sötpotatis (user grows it), Mangold + Svarta vinbär (user just planted). Agronomic data (yields, kcal, macros, sow/harvest months, family) sourced from Livsmedelsverket / RHS / USDA.
- [x] **Schema** — `companion_planting (cropAId FK CASCADE, cropBId FK CASCADE, relationship 'good'|'bad', evidenceLevel 'strong'|'traditional', source text NOT NULL, note text?, createdAt)` with `UNIQUE(cropAId, cropBId)` and canonical-order insert (smaller id first → one row covers both directions). `source` non-nullable at the schema level — no folklore enters the DB. Added to TABLES_SQL + idempotent migration + test-utils.
- [x] **`CompanionService`** — `listForCrop(cropId)` returning `{good, bad}` with partner crop names joined, sorted alphabetically. Pair-order normalisation in `upsert`. 9 service tests cover symmetric lookup, dup rejection, self-pair rejection, evidence-level preservation, source presence, isolation.
- [x] **Seed 46 well-sourced pairs** — top 12 crops + key herbs (Basilika, Dill, Gräslök, Ringblomma). RHS + Cornell Cooperative Extension URLs. Mix of `strong` (Three Sisters, blight-shared Solanaceae) and `traditional` (allium pest deterrence, root-depth complementarity). No anecdotal claims.
- [x] **`GET /api/crops/[id]/companions`** — thin handler over the service.
- [x] **Planting detail companion card** — "Bra grannar" with three stacked sections: in-your-wishlist (emerald), general (muted), avoid (destructive). Each chip carries a 🔗 source link in a new tab. Whole card hidden when the crop has no companion data, so unfamiliar crops (Råg, Vete, etc.) don't show empty noise.
- [x] **i18n** — `plantingDetail.companions.{title,inWishlist,general,avoid,sourceLink}` in sv/en/da.
- [x] **E2E (`@smoke`)** — tomato planting renders both good + bad chips with real-URL hrefs; Råg planting hides the card entirely.

**Phase 2** — suggestion engine integration ✅

- [x] **Companion-bonus when ranking sow suggestions for a location** — `SuggestionService.rankByCropDemandGap` now takes a `CompanionAdjustments` argument. Good companion of a bed neighbour shaves 15pp off the coverage score (surfaces faster); bad companion adds 25pp (pushes down). Soft signal — bad companions aren't filtered out, just down-ranked. Reason text augmented with `Bra granne med <Neighbour> · <baseReason>` so the user sees why it's surfaced. 5 new service tests (annotation, no-companion baseline, good-rank-above-equivalent, bad-rank-below-equivalent, symmetric pair lookup); 44 suggestion tests total green.

<!-- DB size stat in settings — moved to Done. -->

### Image attachments ✅

> Photo journal for plantings (sow → check-in → harvest progression) and visual "labels" for growing locations. Images stored as BLOBs in SQLite for single-file backup, resized server-side via `sharp` to 1600px-long-edge WebP q80, EXIF stripped. The `image` table is a pure storage primitive that knows nothing about hosts; separate join tables (`planting_image`, `location_image`) wire it to domain rows. Image service is fully decoupled and mounted at `/api/image/*`.

**Phase 1** — image service + plantings (the actual value) ✅

- [x] **DB schema** — `image` (`id` uuid PK, `bytes` blob, `mime` text, `sizeBytes` int, `width` int, `height` int, `takenAt` text?, `uploadedAt` text default now) + `planting_image` (`plantingId` FK CASCADE, `imageId` FK CASCADE, `caption` text?, `sortOrder` int default 0, PK on (plantingId, imageId)). Single source of truth for `takenAt` on `image` (from EXIF DateTimeOriginal at upload, else null). Added to `TABLES_SQL` + idempotent `CREATE TABLE IF NOT EXISTS` in `MIGRATIONS_SQL` + mirrored in `test-utils/create-test-db.ts`.
- [x] **`image.service.ts`** — `upload(buffer, mime)` runs sharp pipeline (`rotate()` → resize 1600 long-edge `fit: inside, withoutEnlargement` → `webp({quality:80})` → strip EXIF, extracting `DateTimeOriginal` first via `exif-reader`). `getById`, `delete` (FK cascade on join). 13 service tests cover happy path, WebP conversion, resize, no-enlarge, mime rejection, invalid-buffer rejection, EXIF strip from output bytes, takenAt null fallback, getById, cascade delete to joins. EXIF orientation + DateTimeOriginal _extraction_ covered by E2E with a real fixture (sharp's `withExif()` strips/normalizes those fields when applied to synthetic images, so they can't be unit-asserted from generated fixtures).
- [x] **`planting-image.service.ts`** — `listByPlanting` (joined with image, ordered by `sortOrder` asc then `uploadedAt` desc; no bytes in payload), `attach({plantingId, imageId, caption?, sortOrder?})`, `patch(plantingId, imageId, {caption?, sortOrder?})`, `detach`. 14 tests covering happy paths, ordering, isolation, caption-null clearing, idempotent attach rejection (PK), cross-planting reuse.
- [x] **`/api/image/*`** — `POST` (multipart, returns row without bytes), `GET :id` (streams bytes with `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`, `ETag: <id>`), `DELETE :id` (cascades joins).
- [x] **`/api/planting/[id]/image/*`** — `GET` list, `POST` attach, `PATCH :imageId`, `DELETE :imageId` (detach only).
- [x] **`/api/planting/[id]/harvest` (GET)** + `HarvestEventService.listByPlanting()` + 3 new service tests — needed for the new detail page's Skördehistorik card.
- [x] **`/plantings/[id]` detail page** — header (crop, location, status chip, planted + expected harvest dates), full-width hero image (newest first) with empty-state upload prompt, 3-col thumbnail grid for additional photos (excludes hero), lightbox dialog showing caption + date + cascade-delete with caption-preview confirm, upload modal with native `accept="image/*"` picker + preview + caption textarea, client-side `DELETE /api/image/:id` on cancel-before-save to avoid orphans, plus a Skördehistorik card listing the planting's harvest_event rows with running total and "ej i förråd" hint. Tap any planting row on `/plantings` to navigate (chevron at right edge).
- [x] **Routing fix** — `app/pages/plantings.vue` moved to `app/pages/plantings/index.vue` so Nuxt picks up the new `[id]` dynamic route (mirrors the locations directory).
- [x] **i18n** — `plantingDetail.*` keys (backLink, fields.{plantedDate,expectedHarvest}, image.{empty,uploadButton,uploadTitle,filePicker,captionLabel,captionPlaceholder,saveButton,openLightbox,deleteButton,deleteConfirmTitle,deleteConfirmBody,deleteConfirmWithCaption,error}, harvestHistory.{title,empty,notStored}) + `plantings.card.openDetail` + `common.cancel` in sv/en/da. Swedish first: `Lägg till foto`, `Bildtext (frivilligt)`, `Ta bort foto?`, `Skördehistorik`.
- [x] **TDD coverage** — 30 new service tests (`image.service.test.ts` 13 + `planting-image.service.test.ts` 14 + 3 harvest service additions). 1 new E2E `@smoke` test (`planting-images.spec.ts`): upload fixture → hero renders → lightbox shows caption → cascade delete with caption-preview confirm → empty state returns. 698 unit/integration + 8 smoke tests all green; typecheck clean.

**Phase 2** — locations ✅

- [x] **`location_image` table** — `(locationId FK CASCADE, imageId FK CASCADE, caption?, sortOrder default 0, createdAt, PK on (locationId, imageId))`. Added to `TABLES_SQL` + idempotent `CREATE TABLE IF NOT EXISTS` in `MIGRATIONS_SQL` + mirrored in `test-utils/create-test-db.ts`.
- [x] **`location-image.service.ts`** — `listByLocation` (joined with image, no bytes, ordered `sortOrder` asc → `uploadedAt` desc), `attach`, `patch`, `detach`. 8 service tests cover happy paths, ordering, isolation, duplicate-attach rejection.
- [x] **`/api/location/[id]/image/*`** — `GET` list, `POST` attach, `PATCH :imageId`, `DELETE :imageId` (detach only). Mirrors the planting-image surface.
- [x] **Location detail page** — hero card at the top of `/locations/[id]` with newest photo (or empty-state upload prompt). Two buttons below the hero: **"Byt foto"** (uploads a new row, becoming the hero) and **"Ta bort foto"** (confirms then `DELETE /api/image/:imageId` for the _current hero's image_ — older join rows linger in the DB, so the previous photo becomes the new hero, enabling a future before/after log surface). No lightbox or caption — locations are deliberately simpler than the planting journal.
- [x] **i18n** — `locationDetail.image.*` (empty, addButton, replaceButton, removeButton, removeConfirmTitle, removeConfirmBody, uploadTitle, filePicker, saveButton, error) in sv/en/da. Swedish first: `Inget foto än`, `Byt foto`, `Ta bort foto`.
- [x] **TDD coverage** — 8 service tests + 1 new `@smoke` E2E (`location-images.spec.ts`): upload → hero renders → replace → newest visible → remove → previous photo returns → remove last → empty state. 706 unit/integration + 9 smoke E2E green; typecheck clean.

**Deferred** — not part of this initiative

- [ ] **Crop library images** (showing what e.g. a Brandywine tomato looks like) — wait for real demand; `crop_image` join would slot in trivially.
- [ ] **On-the-fly thumbnail resize** (`GET /api/image/:id?w=400`) — only if grid perf bites at high image counts.
- [ ] **Original-resolution archive** — only if year-end photo book becomes a real use case.
- [ ] **Batch upload UX** — single-at-a-time picker already accepts `multiple` later for free; revisit only if real use feels painful.
- [ ] **Auth gating of image endpoints** — comes for free the day general auth lands (see Ideas).
- [ ] **README homelab section correction** — current docs reference Caddy/HTTPS reverse proxy; actual setup is CasaOS Docker image + Watchtower auto-update, accessed over Tailscale VPN (no Caddy, no DDNS). Bundle into Phase 1 commit or a one-line follow-up.

### Garden management ✅

> Turn the calendar/event page from a thin reminder list into a real chore-management surface. Adds typed events (watering, fertilizing, pruning, weeding, pest-check), edit/delete, RFC-5545-compliant recurring rules, filters, and a per-location "last done" history. Ships in three commits — Phase 1 → 2 → 3 — each independently green and reviewable.

**Phase 1** — typed events + chore catalog (foundation) ✅

- [x] **Add `eventType` column** on `gardenEvent` with `watering | fertilizing | pruning | weeding | pest_check | general` plus existing engine-driven `transplant | harden_off` (kept as `suggestionType`, untouched). Default existing rows to `general` via idempotent `ALTER TABLE` migration in `seed.ts`.
- [x] **Per-type chips + icons** on calendar + dashboard widget — reuse the existing chip pattern (emerald/sky/amber). Each chore type gets its own color + emoji (💧 🌿 ✂️ 🪴 🔍).
- [x] **Quick-add buttons** on the calendar page header — tap "Watering" → opens the form pre-filled with type + smart-default title, user picks location and submits.
- [x] **i18n** — type labels in sv/en/da. Sv first: Vattning / Gödsling / Beskärning / Ogräsrensning / Skadedjurskoll / Allmänt.
- [x] **TDD coverage** — service tests for each type (round-trip), E2E for quick-add flow.

**Phase 2a** — edit / delete / notes / planting-dropdown bug ✅

- [x] **Edit dialog** — reuse the existing `<form>`, prefill from row, hit `PUT /api/garden-event/:id`.
- [x] **Delete action** on each row with confirm dialog.
- [x] **Notes field** — optional `description` column on `gardenEvent`. Textarea on the form, rendered as a second line on the card when present.
- [x] **Bug fix** — calendar form's planting dropdown now shows `${cropName} (${locationName})` (was `Plantings #N`).
- [x] **i18n cleanup** — `calendar.vue:92` hardcoded `'Titel och datum krävs'` moved to `calendar.errors.titleAndDateRequired` (this happened in Phase 1 actually). Service-side `'Härda av {cropName}'` deferred — server-side i18n is a bigger refactor and not blocking.
- [x] **TDD coverage** — service tests (description round-trip on create + update, default-null on omit), E2E for edit + delete + notes + dropdown label.

**Phase 2b** — RRULE-native recurring ✅

- [x] **Add `recurrenceRule: text`** holding an RFC-5545 RRULE string (e.g. `FREQ=WEEKLY;BYDAY=MO`). Migration: idempotent ALTER + a `UPDATE … SET recurrence_rule = 'FREQ=DAILY;INTERVAL=' || recurring_days WHERE recurring_days IS NOT NULL AND recurrence_rule IS NULL` backfill so legacy rows survive. `recurringDays` is still in the schema as a read-only fallback.
- [x] **`rrule` dependency** (~30 KB) for next-occurrence math. `complete()` parses RRULE → computes next occurrence after the current event's date via `RRule.after(dtstart, false)` → spawns the new row. RRULE wins over `recurringDays` when both are set.
- [x] **Recurrence picker UI** — discrete options (Never / Every day / Every weekday (Mon–Fri) / Every week / Every other week / Every month / Every X days). Everything else (e.g. an iCal-imported `FREQ=YEARLY`) becomes a read-only `Custom` option that round-trips through edit without losing the rule.
- [x] **TDD coverage** — 6 RRULE next-occurrence service tests (FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO, FREQ=WEEKLY;INTERVAL=2, FREQ=MONTHLY, RRULE-wins-over-recurringDays, recurrenceRule preserved on spawn), 2 E2E (picker → API persists the right RRULE; loading an existing FREQ=WEEKLY event pre-selects the "Every week" preset).

**Phase 3** — filters + per-location history ✅

- [x] **Filter bar** on the calendar — by event type (single select; multi-select was over-engineering for the data scale) and a `Hide completed` toggle. Both URL-bound (`?type=watering&hide_completed=1`) so filters survive a refresh.
- [x] **"Last done" stat card** on the location detail page — per chore type, the most recent completed-event date with a "X dagar sedan / igår / idag" relative hint. Backed by a single grouped query off `gardenEvent` where `completedAt IS NOT NULL`. Skipped chore types with no completed event so the card stays compact.
- [x] **Hide-completed toggle** — flips behaviour to a "planning view" by hiding rows whose `completedAt` is set. Default off so the existing past-bucket UX (green-bordered completed cards) still works for users who like it.
- [-] **Search by title** — skipped as YAGNI for a single-household tool with low event volume.
- [-] **Dedicated completed-log view** — the `Hide completed` toggle's inverse covers the same ground without a separate UI; promoting only if the user reports a real need.
- [x] **TDD coverage** — 3 new service tests for `getLastDoneByLocation` (per-type latest, location isolation, empty-state nulls) and 4 new E2E (type filter narrows the timeline, filters persist in the URL, hide-completed strips completed rows, location-detail shows the last-done card).

**Deferred** — addressed by a separate iCal feed and engine work, NOT part of this initiative

- [ ] **Reminders/notifications** — sow, tend, harvest delivery mechanism. Once the iCal feed lands (see Ideas), the user's phone calendar app handles reminders natively — no push/email infra needed in Autarki.

### Indoor seedling lifecycle ✅

> Bridge the gap between indoor-sown seedlings and outdoor transplant. Suggestion engine recommends where/when; calendar derives the chores from the accepted plan.

**MVP** — suggestion engine surfaces transplant moments ✅

- [x] **Surface seedling-transplant recommendations** on `/suggestions` for every `planting` with `status='seedling'`. For each seedling, propose an outdoor bed + date using:
  - `readyToTransplantDate = max(plantedDate + weeksToTransplant×7, getLastFrostDate(zone, year))` — biology AND weather have to agree
  - Bed-fit checks (rotation, demand-gap ranking) — reuse existing logic
- [x] **Render alongside sow-options** on each bed card, visually distinguished (emerald border + chip + "Sown {date}" label)
- [x] **Accept flow** — picking the suggestion updates the seedling planting row in place: `status: seedling → planted`, `locationId → outdoor bed`, `plantedDate → transplant date`. No new row created.
- [x] **i18n** — sv, en, da

**v2** — calendar events derived from accepted transplant plan ✅

- [x] **Auto-generate `transplant_due` and `harden_off_start` events** on accept. The accepted transplant suggestion row itself becomes the `transplant_due` event (status flips to null, `suggestionType='transplant'` preserved); only `harden_off` requires a fresh insert at `transplant date − 7 days` (single household-wide constant for MVP, per-crop overrides go to Ideas).
- [x] **Dashboard "this week" widget** — the existing upcoming-events widget already surfaces all `gardenEvent` rows with `status=null` plus harvests; extended `TimelineItem` with `suggestionType` and added emerald (transplant) + sky (harden-off) chips alongside the existing amber harvest chip on both the dashboard widget and the calendar page

**v3** — expose `seedling` status in the planting UI ✅

- [x] **Replace `growing` with `seedling` in the user-facing status picker** (`EDIT_STATUSES` in `app/pages/plantings.vue`). Schema keeps all four values (`seedling`, `planted`, `growing`, `harvested`) for backwards compat — `growing` simply becomes a programmatic-only status.
- [x] **i18n labels** for `plantings.status.seedling` — sv: `Förkultur`, en: `Seedling`, da: `Frøplante`. Also refreshed `errors.invalidStatus` strings.
- [x] **Auto-default `status='seedling'`** when the user picks an indoor location (`growing_location.is_indoor = true`) in the create form, so the suggestion engine picks them up without the user thinking about it. Editing existing rows preserves whatever the user picks.
- [x] **E2E coverage** — updated the existing status-dropdown test to round-trip through `seedling`; added a new test that creates a planting in an indoor location and asserts the resulting row has `status='seedling'`.

### Crop-demand follow-ups ✅

- [x] **Per-crop self-sufficiency detail view** on the dashboard — expand-toggle on the `Självförsörjning` card reveals one row per wishlist crop, sorted lowest-coverage-first (most actionable). Each row shows a stacked progress bar (solid = already in storage, lighter = expected yield to come), a colour bucket (red <50%, amber 50–90%, green ≥90%), and a numeric caption `Lager X • Väntat Y • Behov Z kg/år`. Service now exposes `storageKg` + `expectedYieldKg` separately on `SelfSufficiencyCrop`; sv/en/da i18n keys. E2E `@smoke` asserts the expand → list reveal.

### Crop value & profitability — Finances page

> Today's `/expenses` page only tells half the financial story: money out. Pair it with money "in" — either real (a market grower selling potatoes) or notional (a home grower asking "if I were to buy this at the store, what would it cost?"). Per-household `pricePerKg` on each crop drives derived valuations from existing `harvest_event` and forecast yields. No new income ledger — every kr figure is computed on the fly so the user only ever maintains the price.
>
> Renames `/expenses` → `/finances`, keeps the existing expense list intact, and adds a per-crop P&L summary at the top.

**Locked design**

- **Schema** — new `household_crop_price` table `(id, householdId FK, cropId FK, pricePerKg real, createdAt, updatedAt)` with `UNIQUE(householdId, cropId)`. Mirrors the existing per-household-per-crop pattern used by `household_crop_wishlist` and `crop_burn_rate`. No seed data — entirely user-entered. Currency hardcoded as `kr` for v1 (no household currency column).
- **Price meaning is user-defined** — single price field. The household decides whether it represents "store buy price" (home grower → savings) or "market sell price" (seller → income). i18n copy is purpose-neutral.
- **No income ledger** — valuations are derived, never persisted:
  - `realizedValue(crop, year) = sum(harvest_event.quantityKg WHERE planting.cropId = crop AND year(harvestedDate) = year) × pricePerKg`
  - `forecastValue(crop, year) = sum(expectedYield WHERE planting.cropId = crop AND year(expectedHarvestDate) = year) × pricePerKg` where `expectedYield` reuses the existing area/quantity calculation already used by the dashboard.
  - `spent(crop, year) = sum(expense.cost WHERE cropId = crop AND year(date) = year)` — existing aggregation.
  - `net(crop, year) = realized − spent`.
- **Year bucketing matches `/expenses`** — same year selector; expenses bucketed by `expense.date` (existing), realized by `harvest_event.harvestedDate`, forecast by `planting.expectedHarvestDate`. Picking a year on the page filters all four columns coherently.
- **Crops without a price** — row renders `—` in value columns with a small "Sätt pris" link to Settings. Excluded from totals so the headline P&L stays honest.
- **Settings** — new "Grödpriser" section, same shape as the wishlist UI: dropdown of crops without a price + per-row inline edit + remove. Reuses the existing `SearchableCombobox`.
- **Finances page** — three vertical sections:
  1. **P&L summary card** at top: `Utgifter · Realiserat värde · Prognos · Netto` for the selected year.
  2. **Per-crop breakdown table**: one row per crop with any expense or any planting in the year — columns `Gröda · Utgifter · Realiserat · Prognos · Netto`. Crops without a price → `—` + link. Sorted by net descending.
  3. **Expense list** — existing list and create/edit form, untouched.

**Tasks**

- [x] **Schema + migration** — added `household_crop_price` to `server/db/schema.ts`, `TABLES_SQL`, idempotent `CREATE TABLE IF NOT EXISTS` in `MIGRATIONS_SQL`, mirrored in `test-utils/create-test-db.ts`.
- [x] **`cropPriceService`** (`server/services/crop-price.service.ts`) — `listForHousehold`, `getPrice`, `upsert` (validates `pricePerKg > 0`), `remove`. 12 unit tests covering happy path, upsert overwrite, isolation, validation rejection.
- [x] **`/api/crop-prices`** — `GET ?householdId`, `POST`, `PATCH /:cropId`, `DELETE /:cropId`. Thin handlers; 7 integration tests.
- [x] **`financesService`** (`server/services/finances.service.ts`) — `getSummary(householdId, year)` returns `{ totals, perCrop[] }` joining expenses + harvests + plantings, with missing-price exclusion from value totals (spent still counted). 11 unit tests covering empty case, year isolation, missing-price exclusion, count-mode forecast.
- [x] **`GET /api/finances?householdId=&year=`** — thin handler over the service. 2 integration tests.
- [x] **Settings — Grödpriser section** — new block in `app/pages/settings.vue` mirroring the wishlist UI (combobox + list + inline edit + remove). Persists via the new API.
- [x] **Rename `/expenses` → `/finances`** — moved `app/pages/expenses.vue` to `app/pages/finances.vue`; updated default + garden layout nav, dashboard widget link, and e2e suite (renamed to `tests/e2e/finances.spec.ts`). Old `/expenses` route dropped cleanly (single-user app).
- [x] **P&L summary card + per-crop table** on the new finances page. Year selector reuses the existing one. Crops without a price render `—` + a `Sätt pris` link routing to Settings.
- [x] **i18n** — sv/en/da keys for `finances.*`, `settings.cropPrices.*`, plus renamed nav key `nav.finances.*`. Swedish first: `Ekonomi`, `Utgifter`, `Realiserat värde`, `Prognos`, `Netto`, `Sätt pris`, `Grödpriser`.
- [x] **TDD coverage roll-up** — 30 new unit/integration tests across price + finances services + APIs (all green; 925/925 passing). New `@smoke` E2E `finances-flow.spec.ts`: seed planting + harvest + expense → no price → realized/forecast = 0 kr → set price via API → reload → realized + forecast + net update correctly. Coverage stays at 97.6% statements / 89.1% branches.

**Out of scope**

- Currency configuration — `kr` hardcoded; revisit only if a non-SEK user actually shows up.
- Two prices (`buyPricePerKg` + `sellPricePerKg`) — single field for v1; adding a second column later is a one-line `ALTER TABLE` if the need surfaces.
- Explicit income ledger (manual sale entries) — all valuations derived; promote to its own feature only if real bookkeeping becomes a use case.
- Per-piece pricing (e.g. "50 kr per pumpa") — kg-only for v1; convertible via `yieldKgPerPlant` if needed.
- Price history / time-varying prices — current price always used for both forecast and realized. Re-pricing old harvests intentional non-feature.
- Surfacing kr values on the dashboard, planting cards, crop list, or self-sufficiency page — Finances page is the single home for v1; revisit individual surfaces if asked.

### Kitchen module

> "What can I make from what I have to bridge the gap until next harvest?"

- [ ] **Recipe data model** — name, category (preserve/ferment/bake/brew), primary crop, min quantity kg, output description
- [ ] **Curated recipe library** — preservation, fermentation, baking, brewing, linked to crop types
- [ ] **User-created recipes** — same model as curated, household-scoped
- [ ] **Kitchen page** — "Kan göras nu" (recipes you can make right now from storage) + greyed-out full library

### PWA polish

- [x] **Explicit PWA config** — app name, theme color, `display: standalone` in manifest
- [x] **Meta tags** — `theme-color`, `apple-mobile-web-app-capable`, `status-bar-style`
- [ ] **Android icons** — 192×192, 512×512, maskable
- [ ] **Offline fallback page**
- [ ] **API caching strategy** — network-first for API calls, cache expiration policies

<!-- UI consistency — moved to Done. -->

<!-- Multi-location / multi-planting on calendar events — moved to Done. -->
<!-- Plantings list — search by title + location — moved to Done. -->

### Multi-tenant deploy — friends-and-family scale

> Today Autarki runs single-household on the homelab (Tailscale-only). Open it up so friends and family can sign up themselves without me spinning up a server per family. Tiny scale (≤50 households, mostly idle), so no Postgres migration, no per-tenant infra, no full RBAC. Two-day-ish job if it stays disciplined.

**Locked design**

- **Auth**: Google OAuth via `nuxt-auth-utils` (or equivalent). No passwords, no email infra, friends already have Google accounts. Magic-link is the only acceptable fallback if OAuth proves painful — Resend free tier is plenty.
- **Tenancy model**: **one household per user** on signup. Auto-create the household on first login, seeded from the user's `email` as default name. Multi-user-per-household (invite a partner) is explicitly Phase 2 / Ideas — most users won't need it and it adds permissions complexity.
- **Resolution**: server middleware reads session → sets `event.context.householdId`. Every service takes `householdId` as a parameter; no service may read `householdId` from anywhere but the request context. The hardcoded `householdId = 1` peppered across the frontend goes away (read from session instead).
- **DB isolation**: service-layer `WHERE household_id = ?` everywhere. **No row-level security in the DB** — at this scale, a single isolation integration test (household A creates data, household B asserts they can't see/edit it via every endpoint) is the contract.
- **Schema delta**: backfill `householdId` FK on the five tables that currently lack one — `planting`, `harvestEvent`, `seedVariety`, `activity`, `plantingImage` (the last is debatable since it inherits via `planting`; skip if a join filter is enough). All idempotent ALTER TABLE in `MIGRATIONS_SQL` defaulting existing rows to `householdId = 1`.
- **Public surface**: landing page at `/` for logged-out users (currently the dashboard 404s without a household). Login button → Google OAuth → first-time setup wizard (growing zone, household name, persons) → dashboard.
- **Donate link in Settings**: Stripe Payment Link or Ko-fi — literally just a `<a href>`, no backend, no Stripe SDK. Single line in Settings: "Tycker du om Autarki? ☕ Bjud på en kaffe".

**Tasks**

- [ ] **Schema** — `user` table (`id`, `email` unique, `googleId` unique, `householdId` FK, `createdAt`). Add `householdId` columns on the five missing tables via idempotent ALTERs in `MIGRATIONS_SQL`. Mirror in `test-utils/create-test-db.ts`.
- [ ] **Auth plumbing** — install `nuxt-auth-utils`, wire Google OAuth, create the session schema. Server middleware reads session → looks up user → loads `householdId` into `event.context`. Auto-create user + household on first successful OAuth callback.
- [ ] **Service refactor** — every service in `server/services/**` takes `householdId` as a parameter (or grabs it from context where it's a request handler delegate). Mechanical but tedious — touch every service file. Run typecheck after each batch.
- [ ] **API handler refactor** — every handler in `server/api/**` reads `event.context.householdId` and passes it to the service. Crops, macro presets, companion data, and other globally-shared reference data stay un-scoped.
- [ ] **Frontend session** — replace any hardcoded `householdId = 1` with a `useSession()` composable. Add login page + logout button. Public landing for logged-out users.
- [ ] **Isolation integration test** — `tests/integration/multi-tenancy.test.ts`: spin up household A and B, exercise every endpoint, assert no cross-tenant reads or writes. **This is the only test that catches the inevitable missed `WHERE` clause** — write it once and exhaustively.
- [ ] **First-time setup wizard** — minimal flow on first login: growing zone, household name, persons. Reuses existing Settings form pieces.
- [ ] **Donate link** — Stripe Payment Link (or Ko-fi) in `app/pages/settings.vue` as a single anchor. i18n sv/en/da: "Stötta utvecklingen", "Support development", "Støt udviklingen".
- [ ] **README** — document the deploy (env vars for Google OAuth, donate-link URL, where the SQLite file lives, how to back it up). Drop the "Tailscale only" note when the public deploy happens.
- [ ] **TDD coverage** — service tests get a `householdId` arg; existing tests pass a literal `1`. The isolation integration test above. E2E that hits the OAuth callback path with a mocked provider.

**Out of scope**

- Multi-user-per-household (partner invites) — `user_household` join table later when a real request comes in.
- Postgres migration — SQLite is fine for ≤50 households of mostly-idle traffic.
- Per-tenant backups — one nightly dump of `autarki.db` (now far smaller after the GCS image migration) covers everyone.
- Rate limiting, quotas, abuse handling — you'll know everyone who signs up.
- Per-tenant deletion / GDPR self-service — manual on request until volume justifies a UI.
- Public/private toggle on a household (sharing a garden plan publicly) — separate Idea if asked.
- Row-level security in SQLite — service-layer filter + isolation test is the contract.

### Image storage — move BLOBs to a cloud bucket

> Images are currently stored as BLOBs in SQLite for single-file backup simplicity (see the shipped `Image attachments` work). At single-household scale that's fine, but every uploaded photo grows the DB file, slows backups, and pushes the SQLite-fits-everything ceiling lower. Move the bytes to a GCS bucket (or S3/R2 — same shape) so SQLite stays small forever and image delivery offloads to a CDN-backed object store. Single biggest reason to do this **before** multi-tenant deploy: every new household will upload photos, and a 5 GB SQLite file is a much worse problem than a 5 GB bucket.

**Locked design**

- **Schema delta** — drop `image.bytes` (blob). Add `image.storageKey` (text, unique, e.g. `images/{uuid}.webp`). Everything else on the table (`mime`, `sizeBytes`, `width`, `height`, `takenAt`, `uploadedAt`) stays — they're cheap metadata worth keeping in SQLite for listing/filtering.
- **Provider abstraction** — `server/services/image-storage.service.ts` exposes `upload(key, bytes, mime)`, `getStream(key)`, `delete(key)`. Default implementation talks to GCS via `@google-cloud/storage`. **Dependency-injected** so tests + local dev can swap in a `LocalDiskStorage` impl that writes to `tmp/images/`. No GCS calls in unit tests.
- **Upload path** — `POST /api/image` continues to take multipart upload, runs the existing sharp pipeline (rotate → resize → WebP → strip EXIF), then writes the processed buffer to GCS and records `storageKey` in SQLite. Same response shape (no bytes), no client change.
- **Read path** — `GET /api/image/:id` looks up the row, then either:
  1. **Proxy mode** (v1, simplest): stream the GCS object back through the Nuxt server with the same `Cache-Control: public, max-age=31536000, immutable` + `ETag: <id>` headers.
  2. **Signed-URL redirect mode** (v1.5, optional): respond `302` to a 1-hour signed URL. Client caches that response via the existing immutable header, then talks directly to GCS until the URL expires. Slightly less traffic on the homelab, slightly more complexity.

  Start with proxy mode. Promote to redirect mode only if proxy bandwidth becomes an issue (unlikely at friends-and-family scale).

- **Delete path** — `DELETE /api/image/:id` deletes the GCS object first, then the SQLite row. On GCS failure: log + still delete the row (orphan-in-bucket is cheap; orphan-in-DB-pointing-to-nothing is the real bug). Run a manual sweeper script when bored.
- **Backup story** — SQLite continues to be the single-file backup. GCS bucket lifecycle (versioning + lifecycle rules) is the image backup. Two independent backups; no per-image consistency concern because images are immutable post-upload.
- **Migration** — one-shot script `scripts/migrate-images-to-gcs.ts`: iterate every row in `image`, upload `bytes` → GCS, set `storageKey`, null-out `bytes`. Runs idempotently (skip rows that already have `storageKey`). Once green in prod, drop the `bytes` column via a follow-up migration.
- **Local dev** — `IMAGE_STORAGE=local` env var → writes to `tmp/images/` with `storageKey` as the relative path. No GCS credentials needed for dev.

**Tasks**

- [ ] **`ImageStorage` interface + GCS impl** — `server/services/image-storage.service.ts` + `image-storage.gcs.ts` + `image-storage.local.ts`. Unit tests against the local impl + an in-memory impl for the GCS tests. No live GCS calls in CI.
- [ ] **Schema** — add `image.storageKey` (text, unique) via idempotent ALTER. `bytes` column stays for now (kept until migration script drains it).
- [ ] **Refactor `image.service.ts`** — `upload()` now delegates byte storage to the injected `ImageStorage`. `getById()` no longer returns bytes; new `getStream(id)` returns `{ stream, mime, sizeBytes }` from the storage backend. All existing unit tests stay green via the local impl.
- [ ] **`GET /api/image/:id`** — stream from `ImageStorage.getStream(key)` instead of reading the blob. Preserve cache headers.
- [ ] **Migration script** — `scripts/migrate-images-to-gcs.ts` reads every row with non-null `bytes` and null `storageKey`, uploads to GCS, sets `storageKey`. Idempotent. Document in README. Single integration test using the local impl.
- [ ] **Drop `bytes` column** — separate follow-up migration in `MIGRATIONS_SQL` once prod is fully migrated. `ALTER TABLE image DROP COLUMN bytes` (SQLite supports column drop since 3.35).
- [ ] **`GET /api/db-stats`** — `imageBytes` now sums GCS-resident size (the `image.sizeBytes` column is already accurate). Update the Settings line copy if needed.
- [ ] **Env + docs** — `IMAGE_STORAGE` (`gcs` | `local`), `GCS_BUCKET`, `GCS_KEY_FILE` (path to service account JSON). README section: how to create the bucket, what permissions the service account needs (`roles/storage.objectAdmin` on the single bucket — nothing else).
- [ ] **TDD coverage** — unit tests for both `ImageStorage` impls (`upload` round-trip, `getStream` round-trip, `delete`, idempotent re-upload). Service tests reuse the local impl. E2E: existing image E2E suite must stay green against the local backend (`IMAGE_STORAGE=local`).

**Out of scope**

- CDN in front of GCS — bucket public-read with signed URLs is plenty; promote to a real CDN if egress costs ever bite.
- On-the-fly thumbnail resize at the proxy layer — already in the deferred list under `Image attachments`; same answer.
- Multi-region replication — single-region bucket is fine for ≤50 households.
- Provider switch tooling (move from GCS to S3) — bucket + abstraction is already there; would just be a one-off copy script if it ever happened.
- Per-tenant bucket prefixes — only worth doing when (if) per-tenant deletion / GDPR self-service lands. v1 stores everything under `images/{uuid}.webp` regardless of household.

## Ideas

Concept-stage or design-TBD. Promote to **Up next** once shaped.

- **Server-side i18n for suggestion reasons** — `formatReason` in `suggestion.service.ts` emits Swedish-language strings (and embeds i18n keys like `frostGate.advice.requiresFiberduk` that the client resolves). A proper fix would emit structured `{ base, adviceKey?, interpolation? }` objects and let the client render them, making the suggestions page fully multilingual. Deferred because all three languages share the same Swedish advice strings today and the refactor touches the entire suggestion pipeline.
- **Crop suitability filtering** — hide/warn crops not suitable for the household's growing zone. Needs `minZone`/`maxZone` fields on crops, seed data updates, and UI filtering/warnings.
- **Interplanting / partial-bed suggestions** — today the engine treats every candidate as "fill the whole bed with crop X". For small crops (basilika, dill, gräslök) that's absurd — you want 0.3 m² tucked alongside tomato, not 10 m² of pure basil. After `Wishlist demand model` lands, model required area as `annualDemand / yieldKgPerM2` and surface candidates that fit a fraction of a bed as **interplant suggestions** under a primary candidate, filtered to good companions of the primary. Opens the door to "plant lettuce around the brassicas while they're small" succession-within-bed thinking. Touches the suggestion UI (stacked card showing primary + interplants), accept flow (creates a second `planting` row with the same `locationId`), and rotation logic (must consider all families in the bed). Companion-planting data already provides the pair filter.
- **Flexible growing units & variety library** — household-scoped `variety` table with planting → variety → crop yield chain; dashboard kcal calc respecting active yield mode per planting.
- **Health module** — fasting (16:8 etc.) and its impact on storage duration / kcal need.
- **Meal prep / efficiency tips** — guides for processing harvest.
- **Multi-user / household sharing** — currently single-household.
- **Authentication** — currently no auth.
- **Dashboard calendar-year view** — production scoped to Jan–Dec or growing season (design TBD).
- **Storage-to-recipe suggestions** — surface recipes when a crop has high stock.
- **Phase out kcal-driven dashboard** — pivot the dashboard's mental model away from "do I cover my 8000 kcal/day target?" toward "do I cover what I actually want to eat per crop?". Per-crop coverage view ships first; once it feels complete, demote kcal/macro cards to a collapsed "Detaljer" section, then drop `macroTarget` table, macro advisory nudges, Nordic preset settings, and per-crop macro breakdowns entirely. Keep nutritional data on `crop` rows (still useful for future filtering), just stop treating daily kcal coverage as the primary KPI.
- **Multi-year yield history** — year-per-year harvest totals per crop. `harvest_event` data is already captured; needs a UI.
- **Hunger gap detection** — highlight months with low kcal production vs daily need, suggest strategies.
- **Count-based consumption** — "jag tog 5 potatisar" requires `weightPerUnit` on crop + unit toggle on consume form.
- **Per-crop hardening-off override** — `hardenOffDays` field on `crop` (with household default). Tomatoes typically want 7–10 days, peppers 14, brassicas can skip it.
- **Preserve original sow date** — `sownDate` column on `planting` so transitioning seedling → planted doesn't overwrite the indoor sow date. Enables multi-year sowing history and "from seed to plate" timelines.
- **Push notifications for harden-off start** — depends on the reminders/notifications delivery mechanism in "Up next".
- **iCalendar (.ics) feed** — token-gated read-only endpoint `/api/calendar.ics?token=…` that serializes `gardenEvent` rows + harvest dates as `VEVENT` blocks (with `RRULE` taken verbatim from `recurrenceRule` once Phase 2 lands). User subscribes once on their phone; their calendar app handles polling, display, and reminders. Skipped for now in favor of the in-app event-page improvements; promote when push-notifications-from-the-phone-calendar-app becomes the priority. CalDAV (bidirectional) stays out of scope — separate Idea if ever needed.
- **Succession-planting awareness** — high-leverage extension of the suggestion engine that turns "the bed isn't done — refill it" into actionable nudges. After a harvest event marks a bed empty (or about to be), surface 2-3 crops that fit the remaining frost-free window: `daysToMaturityFromTransplant + indoor/direct sow window + getLastFrostDate(zone)`. Example: _"You just harvested radish (Jul 15). Frost-free until Oct 5. Fits in 80 days: sallat, spenat, rädisa (round 2)."_ No new agronomic data needed — uses existing crop fields + the zone's frost calendar. Pairs naturally with the "garden as a live place" north star; should be promoted to Up next once companion-aware suggestions ships.
- **Crop guide pages (`/crops/[id]`)** — reference-style detail page for the crop library: existing macros + yields + (eventually) curated growing tips with sources. Deferred from the companion initiative because static tips proved low-leverage versus companion adjacency; revisit only if the user finds themselves wishing for reference material.

## Done

Major capabilities that have shipped:

- **Core loop** — plantings, harvest, storage, dashboard, crops library, locations, mobile-first responsive layout, activity logging, i18n (sv/en/da), shadcn-vue.
- **Macros & nutrition** — macro targets with Nordic dietary presets, dashboard macro bars, days-of-runway, harvest event log, per-crop burn rate, shelf-life tracking, macro advisory nudges.
- **Self-sufficiency model** — `kgPerWeek` on wishlist, demand-gap ranking, average self-sufficiency on dashboard, kgPerWeek inline on settings.
- **Flexible planting** — count mode (quantity × yieldKgPerPlant), per-plant yield defaults, household default unit, macro breakdown per location, location detail view.
- **Calendar** — harvest timeline, urgency grouping (Idag / Denna vecka / Snart / Längre fram / Passerat), dashboard widget.
- **Shelf-life tracker** — grouped storage view, FIFO consumption, "snart utgånget" tiers, quick consume + manual kg input.
- **Succession guide** — bed-centric suggestions, rotation filter, sow-window filter, perennial exclusion, demand-gap ranking, accept/dismiss flow, "how it works" explainer.
- **Growing zones** — odlingszon 1–8 with auto-detection.
- **Image attachments** — photo journal on plantings (hero + grid + lightbox + cascade delete with caption preview, plus Skördehistorik card on `/plantings/[id]`) and a hero-photo replace/remove flow on `/locations/[id]`. BLOBs in SQLite (single-file backup), `sharp` pipeline at 1600px-long-edge WebP q80, EXIF stripped with `DateTimeOriginal` extracted.
- **Cost tracking** — expense log per household with date, description, cost, optional crop/location FK; dedicated `/expenses` page.
- **DB size stat in settings** — `GET /api/db-stats` returning `{totalBytes, imageBytes}` driven by `PRAGMA page_count * page_size` and `SUM(LENGTH(bytes))` on the image table; surfaced as a single read-only line on the Settings page.
- **Wishlist demand model — weekly + yearly** — `householdCropWishlist.kgPerYear` added alongside `kgPerWeek` so preservation crops (vitlök, winter squash) and herbs become first-class wishlist members. Service + API enforce at-least-one-of validation; engine, dashboard, storage depletion, and macro advisory all consume `annualDemand = weekly*52 + yearly`; legacy both-null rows surface as a "Saknar behov" badge on Settings; how-it-works copy on `/suggestions` updated in sv/en/da.
- **Plantings list — search by crop + location** — collapsible search bar at the top of `/plantings` filtering by `normalize(cropName) + normalize(locationName)` substring (case- + diacritic-insensitive). 300ms expand/collapse transition. Shipped in `066a7e2` + `316b8fb`.
- **UI consistency — every form select is a Vue component** — all 17 native `<select>` elements across calendar, settings, storage, plantings, and locations swapped to `SearchableCombobox` (long/dynamic lists like location/variety/planting/preset/move-target/growing-zone pickers) or shadcn-vue `Select` primitives (short fixed lists like eventType, recurrencePreset, language, default unit, harvest unit, status pill, frost-protection presets). E2E tests updated to interact via click/option instead of native `selectOption()`.
- **Multi-location / multi-planting on calendar events** — garden events now tag many beds + plantings via junction tables (`garden_event_location`, `garden_event_planting`). Form uses `ChipMultiSelect`; card pills collapse to counter (`📍 4` / `🌱 3`) at count ≥ 2 with inner `event-location-count` / `event-planting-count` testids; clicking any pill opens the edit modal. Clean cut — old singular columns dropped, API singular-key fallback removed, no dual-write.
- **Developer experience** — TDD with Vitest + Vue Test Utils, Playwright E2E with `@smoke` subset on pre-push, 80% coverage gate, automatic decimal-versioned releases to GHCR, Watchtower auto-update on the homelab.
