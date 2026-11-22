# Frost Tolerance Research — Smart Frost Gate

> Question: should we model crop frost tolerance as **days around frost** or **minimum survivable °C**?
> Research date: 2026-05-25.

## TL;DR

**No reputable source publishes "days past first frost" tolerance per crop directly.** All horticulture references use minimum survivable temperature in °F or °C. We have three paths and one clear recommendation.

## What sources actually publish

### Days-based sources — verdict: do not exist

- **RHS Crop Rotation guide** — discusses rotation years per family, not frost-day tolerance per crop.
- **Eliot Coleman, _Winter Harvest Handbook_** — talks qualitatively about ~30 "cold-hardy" crops (arugula, beet greens, carrots, chard, claytonia, kale, leeks, lettuce, mâche, mizuna, mustard greens, parsley, spinach, etc.) but does NOT publish per-crop day counts. He gives temperatures: "easily survive down to 10°F (–12°C) or lower".
- **Johnny's Selected Seeds Winter Growing Guide** — publishes planting calendars (when to sow for a winter harvest), not day-based tolerance.
- **Charles Dowding** — qualitative "hardy" / "tender" classifications without numeric tolerance.
- **Sustainable Market Farming (Pam Dawling)** — temperature-based only.

**Conclusion:** Path A (direct days) is not seedable from reputable sources.

### Temperature-based sources — verdict: rich and actionable

**Primary source — Pam Dawling, "Winter-Kill Temperatures of Cold-Hardy Vegetables"**, Sustainable Market Farming, updated annually (2018/2020/2021 editions found). Empirical year-over-year data, ~30 crops with variety-specific thresholds and protection notes.

| Crop                        | Unprotected °C                           | Notes                        |
| --------------------------- | ---------------------------------------- | ---------------------------- |
| Arugula                     | -6 (some hardier)                        |                              |
| Beet                        | -7 (Bulls Blood, Chioggia: -9.5)         |                              |
| Broccoli (heads)            | -7 to -12 (Purple Sprouting)             |                              |
| Cabbage                     | -3 to -11 (varies by variety)            |                              |
| Carrot                      | -11 (Danvers, Oxheart)                   |                              |
| Cauliflower                 | -7 (heads); leaves to -19                |                              |
| Chard                       | -9.5 (red) to -12 (green)                |                              |
| Claytonia / Winter purslane | -34 to -40 (zone 3 hardy)                |                              |
| Mâche / Corn salad          | -18                                      |                              |
| Garlic                      | -18 tops; -15 small bulbs                |                              |
| Kale                        | -9 (typical); -12 (hardy Russian)        |                              |
| Kohlrabi                    | -9.5                                     |                              |
| Leek                        | -11 to -15 (Tadorna: -18)                |                              |
| Lettuce                     | -6 (large leaves); hearts hardier        |                              |
| Mustard greens              | -4 to -14 (Chinese Thick-Stem)           |                              |
| Onion/Scallion              | -4; bulb onions -18                      |                              |
| Parsnip                     | -18, "probably colder"                   | Often overwintered in-ground |
| Radish                      | -7 (Cherry Belle) to -12 (winter radish) |                              |
| Spinach                     | -12 (savoy leaf)                         |                              |

**Secondary sources for cross-reference:** Botanical Interests, Gardening Know How, Harvest to Table. All temperature-based, all approximately agree with Dawling.

**RHS Hardiness Ratings (H1a–H7)** — too coarse (5°C bands). Designed for "will this perennial survive your winter", not annual vegetable season-extension. Skip.

## My earlier claims — verified

I'd written numbers in the BACKLOG without sources. The audit:

| My claim                     | Actual (per Dawling)    | Verdict                                                                    |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| Grönkål -10°C / 14 days      | -9 to -12°C             | ✅ close, slightly understated                                             |
| Purjo -10 to -15°C / 30 days | -11 to -18°C            | ✅ slightly understated                                                    |
| Palsternacka -15°C / 45 days | -18°C "probably colder" | ✅ understated                                                             |
| Spenat -7°C / 14 days        | -12°C (savoy)           | ⚠️ **significantly understated** — spinach is more frost-hardy than I said |
| Mâche -15°C / 30+ days       | -18°C                   | ✅ close                                                                   |
| Sallat -2°C / 7 days         | -6°C (large leaves)     | ⚠️ **understated** — lettuce hardier than I said                           |
| Tomato 0°C / 0 days          | confirmed               | ✅                                                                         |

Lesson: empirical sources are _more generous_ than my conservative guesses. Sourcing matters.

## Swedish temperature data

**SMHI (Sveriges meteorologiska och hydrologiska institut)** publishes 30-year normal monthly mean temperatures by region/station, current period 1991–2020. URL: `smhi.se/kunskapsbanken/klimat/normaler/normalperioden-1991-2020`.

**Important caveat:** SMHI data is keyed by **geographic location**, not by Swedish odlingszon (growing zone 1–8). We'd need to map odlingszon → representative weather station(s) to get a zone-keyed temperature curve. Alternative: use first-frost / last-frost dates per zone (which we already have in `getZoneFrostDates`) and a sinusoidal curve through those endpoints.

## Three paths

### Path A — Days direct from source

**Rejected.** Sources do not exist.

### Path B — Days derived once via script

- Take `minTempC` from Dawling per crop.
- Build a zone-keyed temperature curve from SMHI (or from frost-date endpoints).
- Run a one-time script: for each `(crop, zone)` pair, find the date where `expectedMinTemp = minTempC`, compute days delta from first/last frost.
- Store the resulting day counts in `crop.lastFrostToleranceDays` / `crop.firstFrostToleranceDays`.

**Pros:** runtime engine stays simple; days are fast to compare against dates.
**Cons:** numbers are derived, citation chain becomes "Dawling -9°C + SMHI zone 3 curve = 14 days" — harder to audit; numbers become wrong if SMHI normals shift or our curve assumption changes.

### Path C — Temperature in schema, runtime curve in engine

- Schema: `crop.minTempC: integer (default 0)` — single field, matches what every source publishes.
- Engine adds `getExpectedMinTempC(zone, date) → number` helper (curve built from frost-date endpoints + SMHI normals).
- `classifyFrostTier` computes effective min temp for the candidate's sow/harvest date and compares to `crop.minTempC` (with location's protection buffer added).

**Pros:** direct correspondence to published sources; citations stay verbatim ("kale = -9°C, source: Sustainable Market Farming"). Location buffer becomes a clean °C number too (`growingLocation.frostBufferC`).
**Cons:** new ~30-line helper for the temperature curve; runtime arithmetic per candidate (negligible).

## Recommendation

**Path C — temperature in schema.**

Reasons:

1. Direct alignment with sources. Every value traces to a published °C.
2. The runtime curve helper is small and self-contained.
3. Location protection naturally becomes a °C buffer (polytunnel = +3°C, fiberduk = +2°C) — symmetric, simple, composable.
4. Avoids the opacity of Path B's derived numbers.
5. Future-proofs us if we ever pull live forecasts from SMHI's API instead of normals.

The downside the user previously flagged ("switching to temperature is not easy") is real but smaller than I claimed earlier — the curve helper is ~30 lines, the field migration is one new column per crop instead of two, and the asymmetry we wanted on the crop side disappears naturally (temperature is symmetric, dates aren't).

## Concrete next step

Rewrite the **Smart frost gate** BACKLOG entry to use:

```ts
crop.minTempC: integer (default 0)            // e.g., kale = -9, parsnip = -18, tomato = 0
growingLocation.frostBufferC: integer         // 0 = open, +3 polytunnel, +5 unheated greenhouse

// runtime
getExpectedMinTempC(zone, date) → number      // new helper in server/utils/growing-zones.ts
```

And add a backlog sub-task to **source `minTempC` per crop** from Sustainable Market Farming + cross-reference RHS / Cornell where available, with `// source: <URL>` inline comments per crop in `seed-data.ts`.

## Sources

- [Winter-Kill Temperatures of Cold-Hardy Vegetables 2021 — Sustainable Market Farming](https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/)
- [Winter-Kill Temperatures 2020 — Sustainable Market Farming](https://www.sustainablemarketfarming.com/2020/03/10/winter-kill-temperatures-of-cold-hardy-vegetables-2020/)
- [Winter-Kill Temperatures 2018 — Sustainable Market Farming](https://www.sustainablemarketfarming.com/2018/01/23/winter-kill-temperatures-of-cold-hardy-vegetables-2018/)
- [Eliot Coleman, _The Winter Harvest Handbook_](https://www.chelseagreen.com/product/the-winter-harvest-handbook/)
- [RHS Hardiness Ratings (PDF)](https://www.rhs.org.uk/plants/pdfs/rhs-hardiness-rating.pdf)
- [Johnny's Selected Seeds Winter Growing Guide](https://www.johnnyseeds.com/growers-library/methods-tools-supplies/winter-growing-season-extension/library-vegetables-first-last-to-market.html)
- [Botanical Interests — Frost Tolerance of Vegetables](https://www.botanicalinterests.com/community/blog/frost-tolerance-of-vegetables/)
- [Gardening Know How — Vegetable Cold Tolerance](https://www.gardeningknowhow.com/edible/vegetables/vgen/vegetable-cold-tolerance.htm)
- [SMHI Normalperioden 1991-2020](https://www.smhi.se/kunskapsbanken/klimat/normaler/normalperioden-1991-2020)
- [SMHI Normalkartor](https://www.smhi.se/klimat/klimatet-da-och-nu/normalkartor/normal/manadsmedeltemperatur-normal/alla-manader/1991-2020)
