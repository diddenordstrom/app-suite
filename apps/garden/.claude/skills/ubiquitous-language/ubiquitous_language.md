# Ubiquitous Language

The canonical vocabulary for the Self-Sufficiency Garden Planner domain. Every concept has one name here — code, UI, and conversation should all use it.

When a term is missing, ambiguous, or contradicted by the code, invoke the `ubiquitous-language` skill to reconcile.

---

### Bed

An outdoor [[GrowingLocation]]. Not a separate entity in the database — it's a _role_ a `GrowingLocation` plays when `isIndoor = false`. Used in suggestion, rotation, and sow-window contexts where indoor locations (pots, windowsills, greenhouses) don't apply.

- **Code:** `BedSuggestion`, `generateBedSuggestions()`, `/api/suggestions/bed`, `suggestionType: 'empty_bed'`. The underlying record is still a `growingLocation` row with `isIndoor = false`.
- **Related:** [[GrowingLocation]], [[Planting]]

### Crop

A species in the catalog — e.g. tomato, basil, kale. The thing you _can_ grow, not the thing you _are_ growing. Holds yield, nutrition, sow/harvest windows, family, perennial flag.

- **Synonyms to avoid:** species, plant-type (use `Crop`)
- **Code:** `crop` table, `Crop` type
- **Related:** [[Planting]], [[SeedVariety]]

### FrostTolerance

The minimum outdoor air temperature (°C) at which a crop survives. The suggestion engine's frost-gate classifier (SAFE / STRETCH / IMPOSSIBLE) compares this against the **expected minimum temperature** for the candidate's sow/harvest date — computed from the household's growing zone plus SMHI normals — adjusted by any per-location protection buffer.

Sourced primarily from Sustainable Market Farming's empirical Winter-Kill Temperatures dataset; cross-referenced with Cornell Cooperative Extension, RHS hardiness bands, and Eliot Coleman's _Winter Harvest Handbook_.

- **Code:** `crop.minTempC` (integer, default 0). Sample values: tomat = 0, sallat = -6, grönkål = -9, purjo = -11, palsternacka = -18.
- **Pairs with:** [[GrowingLocation]]'s `frostBufferC` (per-bed permanent protection — cold frame +2, polytunnel +3, unheated greenhouse +5) and the engine's `FIBERDUK_BONUS_C` (+2°C, surfaced as advice text on STRETCH candidates, not stored on any row).
- **Synonyms to avoid:** `frostToleranceDays`, `lastFrostToleranceDays`, `firstFrostToleranceDays`, `coldHardinessDays`. We briefly modeled days-around-frost and rejected it because no reputable source publishes days per crop — every published reference uses minimum °C. See `frost-tolerance-research.md` at the repo root for the sourcing audit.
- **Related:** [[Crop]], [[GrowingLocation]]

### GrowingLocation

A physical place a [[Planting]] can live. Has an area in m², an indoor/outdoor flag, and belongs to a [[Household]]. Covers everything from outdoor beds to indoor pots and greenhouses.

- **Synonyms to avoid:** location (too generic on its own — qualify as "growing location" when ambiguous)
- **Code:** `growing_location` table, `GrowingLocation` type, `locationId` foreign keys
- **Related:** [[Bed]], [[Planting]], [[Household]]

### Household

The top-level owner of everything in the app — persons, growing zone, growing locations, plantings, storage, expenses. One household per running instance (single-tenant for now).

- **Code:** `household` table, `Household` type, `householdId` foreign keys
- **Related:** [[GrowingLocation]], [[Planting]]

### Planting

A specific instance of a [[Crop]] sown into a [[GrowingLocation]] on a given date. Has area or quantity, status (`planted` / harvested / etc.), an optional [[SeedVariety]], and an expected harvest date. The thing you _are_ growing.

- **Synonyms to avoid:** crop instance, sowing (use `Planting`)
- **Code:** `planting` table, `Planting` type, `plantingId` foreign keys
- **Related:** [[Crop]], [[GrowingLocation]], [[SeedVariety]]

### SeedVariety

A named variety of a [[Crop]] — e.g. "Sungold" for tomato, "Lacinato" for kale. Optional refinement on a [[Planting]]; carries its own sow/harvest windows, sun requirement, watering frequency, and notes.

- **Synonyms to avoid:** cultivar, variety (use `SeedVariety` in code; "variety" is fine in UI)
- **Code:** `seed_variety` table, `SeedVariety` type
- **Related:** [[Crop]], [[Planting]]
