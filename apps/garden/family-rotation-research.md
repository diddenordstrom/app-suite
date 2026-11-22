# Family Rotation Research — Per-Family Rule Set

> Question: what hard-exclusion years, soft-penalty years, and legume-predecessor bonuses should drive the per-family rotation rule set replacing the flat `ROTATION_LOOKBACK_DAYS = 730`?
> Research date: 2026-05-27.

## TL;DR

**Provisional values are mostly too lenient.** The 4-year hard exclusion for Brassicaceae is dangerously low given clubroot's 20-year soil persistence, and Jordbruksverket recommends 6–7 years minimum. White rot in Alliaceae renders rotation largely ineffective as a disease-eradication strategy, making "soft penalty + hygiene advice" more honest than any hard-exclusion promise. Solanaceae's Verticillium dahliae persists 7–14+ years, making 3 years too short. The legume N-fix benefit is real and quantified (peas: 36–125 kg N/ha fixed, 18 kg/ha net residual average), but it is a ranking nudge, not a cure.

---

## 1. Methodology — Sources Weighted and Why

Sources were evaluated in this priority order:

1. **Jordbruksverket (Swedish Board of Agriculture)** — Swedish-language agronomic authority; directly applicable to Swedish home-garden context, which is the target user base. Primary source: _Växtföljd i ekologisk grönsaksodling_ (p7_7), which yields 6–8 year rotation recommendations.

2. **Royal Horticultural Society (rhs.org.uk)** — UK gardening authority with strong home-garden focus; disease-specific factsheets (club-root, onion white rot). Direct URLs cited below.

3. **University Extension publications** — UC IPM, Cornell Cooperative Extension, UMass Amherst, University of Maine, Pacific Northwest Pest Management Handbooks (Oregon State). Peer-reviewed or professionally reviewed; quantitative persistence data.

4. **Peer-reviewed scientific literature** — Annual Reviews of Phytopathology, PMC/PubMed, Frontiers in Sustainable Food Systems. Used for quantitative persistence figures (e.g., half-life of _P. brassicae_ spores, N-fixation kg/ha data).

5. **Eliot Coleman, _The New Organic Grower_, 3rd ed. (Chelsea Green)** — 8-year rotation sequence (Chapter 7); canonical sequencing rationale for legume-brassica-solanaceae ordering.

6. **Charles Dowding, _No Dig Organic_** — deliberately lenient counterpoint. Dowding deprioritises strict rotation in favour of soil health and raised beds; cited where it informs the "practical home garden" calibration.

**Sources explicitly rejected:** garden blog posts without citation chains, unattributed forum advice, Wikipedia as a primary source (used only to locate primary-source citations).

**Key calibration note:** All persistence figures are for worst-case, already-infected soil. A home garden with 4–8 raised beds that has _never_ had clubroot or white rot is in a different situation than a commercial field with established inoculum. The rules in this document target the "once introduced, how long must you stay away?" scenario, which is the correct framing for a rotation engine — you cannot know which beds are clean.

---

## 2. Per-Family Rotation Rule Table

### 2.1 Brassicaceae — kål, broccoli, grönkål, rädisa, ruccola, pak choi

**Driver disease: Clubroot (_Plasmodiophora brassicae_)**

_Persistence:_ Resting spores survive in soil **up to 20 years**, with a half-life of approximately 4 years (Wallenhammar et al., _Phytopathology_ 2021; RHS club-root factsheet). The 7–18 year range often cited in the literature reflects field variation; 20 years is the published maximum.

_What "2-year rotation" means:_ Standard general guides (Cornell CCE, Old Farmer's Almanac) recommend 3-year minimum rotations for _all_ families uniformly. This is appropriate for _prevention_ — keeping clean beds clean — but is not a "cure" once clubroot is established.

_Jordbruksverket recommendation:_ **Minimum 6 years** between Brassicaceae crops; some guidance says 7 years for organically managed fields. Source: _Växtföljd i ekologisk grönsaksodling_, p7_7.

_RHS recommendation:_ No explicit year count given; states spores "can contaminate soil for up to 20 years" and emphasises liming and prevention rather than rotation as the control mechanism. Implies rotation alone is insufficient once established.

**The tension (practical calibration):**
A 20-year exclusion would make Brassicaceae unsuggestable in any bed that has ever grown kål — clearly unworkable in a 4–8 bed garden. The honest framing is:

- In a **clean bed with no clubroot history**: a shorter rotation (4–6 years) is agronomically sound _because the disease is not present_.
- In a **bed with known clubroot history**: no rotation period is sufficient; lime, resistant varieties, and careful hygiene are the tools.

The engine cannot know whether a specific bed has clubroot, so it must use a single practical rule that (a) is clearly better than 2 years, (b) matches Jordbruksverket's published guidance, and (c) is achievable in a realistic Swedish home garden with 4–6 growing beds.

**Decision: Hard exclusion = 6 years** (Jordbruksverket minimum; also what a 6-bed rotation naturally produces if beds rotate annually). Soft penalty = none (the hard exclusion is the right tool here; a soft penalty in year 5 would be misleading noise).

|                | Provisional | Recommended | Source               |
| -------------- | ----------- | ----------- | -------------------- |
| Hard exclusion | 4 yrs       | **6 yrs**   | Jordbruksverket p7_7 |
| Soft penalty   | —           | —           | N/A                  |

---

### 2.2 Alliaceae — lök, vitlök, purjo, gräslök

**Driver disease: White rot (_Sclerotium cepivorum_ / _Stromatinia cepivora_)**

_Persistence:_

- RHS: sclerotia "can remain in the soil for at least 15 years" — rotation is "impractical" as a control tool.
- UC IPM: sclerotia survive "over 20 years."
- Pacific Northwest Pest Management Handbooks: sclerotia "may survive in soil for 20 to 30 years."
- University of Maine Cooperative Extension (_Bulletin #2062_): white rot "can render a field unusable for garlic or onion production for as long as 40 years."

Critically: sclerotia are **host-stimulated dormancy breakers** — they only germinate in response to allium root exudates. This means non-allium crops in the rotation do _not_ deplete the inoculum; they leave it intact until the next allium arrives.

**Implication for a rotation engine:**
Unlike clubroot (which declines over time even without a host), white rot sclerotia are essentially banked indefinitely until triggered. A hard-exclusion year count is a false precision: once white rot is in a bed, _no practical rotation period eliminates it_.

The correct engine behaviour is:

- **A soft penalty** that ranks alliums lower in beds with recent allium history (discourages inoculum buildup through dense allium cultivation).
- **Agronomic advice text** surfaced when alliums are suggested in beds with allium history: "Vitlök, lök och purjo är känsliga för vitröta (_Sclerotium cepivorum_). Sporer kan överleva i jord i 20–40 år. Rotera och odla aldrig alliaceaer i täta intervall."

**Decision:**
The provisional "4-year hard exclusion" for Alliaceae is not wrong as a minimum spacing rule, but it is misleadingly optimistic if it implies the disease has cleared. Adopt:

- **Soft penalty window = 4 years** (penalises consecutive or near-consecutive planting, which is the main driver of inoculum buildup)
- **Hard exclusion = none** (or equivalently: the hard exclusion is already captured by the pest-hygiene framing; no rotation period is scientifically defensible as "safe")

|                | Provisional | Recommended          | Source               |
| -------------- | ----------- | -------------------- | -------------------- |
| Hard exclusion | 4 yrs       | **none (soft only)** | RHS; UC IPM; U Maine |
| Soft penalty   | —           | **4 yrs**            | RHS; PNWPMH          |

---

### 2.3 Solanaceae — potatis, tomat, paprika, aubergine

**Driver diseases: Verticillium wilt (_Verticillium dahliae_), late blight (_Phytophthora infestans_), early dying complex**

_Persistence:_

- _V. dahliae_ microsclerotia: **7–14+ years** in soil (NC State Extension; _Tandfonline_, Verticillium wilt of potato review 2010). Some papers cite persistence "up to 10 years or more."
- _P. infestans_ (late blight): oospores may survive "many years" in soil; rotation of 2–3 years recommended to reduce inoculum (APS Plant Disease Lessons). However, late blight primarily spreads via infected tubers and airborne spores, so rotation is useful but not the sole control.
- Eliot Coleman's 8-year sequence places tomatoes and potatoes **4 years apart** specifically because of shared pathogen risk.

_Practical recommendation:_ Most university extension sources (UMass, NC State, Cornell) recommend **3–4 years** as the practical minimum. Verticillium's 7–14 year persistence means 3 years reduces inoculum but does not eliminate it; still, 3–4 years is the published standard because the disease does not build to catastrophic levels as quickly as clubroot, and the broad host range of Verticillium (affects brassicas, strawberries, etc.) means "clean" alternatives are limited anyway.

**Decision: Hard exclusion = 4 years** (upper end of 3–4 year academic consensus; matches Coleman's tomato-potato spacing; an improvement over the provisional 3 years and more honest given Verticillium persistence).

|                | Provisional | Recommended | Source                            |
| -------------- | ----------- | ----------- | --------------------------------- |
| Hard exclusion | 3 yrs       | **4 yrs**   | NC State Extension; Coleman Ch. 7 |
| Soft penalty   | —           | —           | N/A                               |

---

### 2.4 Cucurbitaceae — gurka, pumpa, squash, zucchini

**Driver diseases: Fusarium crown/fruit rot (_Fusarium solani_ f. sp. _cucurbitae_), bacterial wilt, Sclerotinia**

_Persistence:_

- Fusarium chlamydospores: can persist in soil **up to 7 years** in some studies; other reports cite 2–3 years in debris, or "30+ years" for some _F. oxysporum_ formae speciales (though the extreme figures relate to strawberry Fusarium, not cucurbit). The cucurbit-specific literature (PNW Pest Handbooks, Bayer crop science) gives **4–5 years** as the practical rotation recommendation.
- Bacterial wilt (via _Erwinia tracheiphila_) overwinters in the cucumber beetle, not in soil — rotation does not directly help, but reducing host density slows vector buildup.
- Sclerotinia has a broad host range (400+ species) making rotation largely ineffective for Sclerotinia specifically (Frontiers in Plant Science 2021).

The provisional 2-year soft penalty was based on the disease pressure being meaningful but not catastrophic. Given Fusarium's 4–5 year rotation recommendations, this is too lenient.

**Decision: Soft penalty = 3 years** (no hard exclusion — cucurbit diseases are serious but not in the "decade-scale" category that justifies dropping a crop from consideration entirely; upgraded from 2 years based on Fusarium persistence data).

|                | Provisional | Recommended | Source                       |
| -------------- | ----------- | ----------- | ---------------------------- |
| Hard exclusion | —           | —           | N/A                          |
| Soft penalty   | 2 yrs       | **3 yrs**   | PNW Pest Handbooks; Bayer UK |

---

### 2.5 Apiaceae — morot, palsternacka, dill, selleri, persilja, fänkål

**Driver pests/diseases: Carrot fly (_Psila rosae_), Sclerotinia (_S. sclerotiorum_ and _S. minor_)**

_Persistence:_

- Carrot fly pupae overwinter in soil near host plants and emerge the following April. They are **annual-cycle pests** — a single season break in the same bed substantially reduces the resident population. A 1–2 year away period is agronomically meaningful.
- Sclerotinia sclerotiorum: sclerotia survive **3–5 years** in soil (Missouri IPM, Oklahoma State Extension); some sources report up to 8–10 years, but 3–5 years covers the practical range. Importantly, Sclerotinia has over 400 host species including lettuce, brassicas, and cucurbits — rotation to these families does not help. The engine cannot assume a "safe" successor family.

Given carrot fly's annual cycle and Sclerotinia's relatively short sclerotia viability (compared to white rot or clubroot), the 2-year soft penalty is defensible. The provisional values are confirmed.

**Decision: Soft penalty = 2 years** (confirmed; carrot fly and Sclerotinia both justify this but neither demands a hard exclusion in a home garden context).

|                | Provisional | Recommended           | Source                       |
| -------------- | ----------- | --------------------- | ---------------------------- |
| Hard exclusion | —           | —                     | N/A                          |
| Soft penalty   | 2 yrs       | **2 yrs** (confirmed) | RHS carrot fly; Missouri IPM |

---

### 2.6 Chenopodiaceae / Amaranthaceae — rödbeta, mangold, spenat

**Driver disease: Cercospora leaf spot (_Cercospora beticola_)**

_Persistence:_

- Cornell Cooperative Extension (Cercospora Leaf Spot of Table Beet factsheet): pathogen survives in soil "up to 3 years" on infected plant residues. Rotation with non-host crops for "at least 3 years" is recommended.
- UMass Amherst confirms 3-year rotation recommendation.

**Decision: Soft penalty = 3 years** (upward revision from 2 years; Cornell recommends "at least 3 years" and the pathogen's documented 3-year persistence in debris supports this directly).

|                | Provisional | Recommended | Source                     |
| -------------- | ----------- | ----------- | -------------------------- |
| Hard exclusion | —           | —           | N/A                        |
| Soft penalty   | 2 yrs       | **3 yrs**   | Cornell CCE; UMass Amherst |

---

### 2.7 Fabaceae — ärt, böna, bondböna, sockerärta

**Driver diseases: Aphanomyces root rot (_Aphanomyces euteiches_), Fusarium root rot complex**

_Persistence:_

- _Aphanomyces euteiches_ oospores: survive in soil **10+ years** (PNW Pest Handbooks; Saskatchewan Pulse Growers; Manitoba Pulse & Soybean Growers).
- Commercial pulse agronomy recommends **6–10 years** between pea/lentil crops: "minimum six-year, and preferable eight-year, crop rotation" (NDSU Agriculture).
- "Legume fatigue" — a buildup of multiple pathogens (_Aphanomyces_, _Fusarium_, _Phoma_, _Rhizoctonia_, _Pythium_) — renders direct control "not possible in either conventional or organic farming" after establishment (Global Bean Project / European Crop Research Review, 2018).
- **Autotoxicity:** peas and beans exhibit intraspecific allelopathy — growth and yield of replanted legumes are significantly reduced by residual allelochemicals from previous legumes of the same species (Assaduzzaman & Asao, _Scientia Horticulturae_ 2011; SciRP 2014). Pod numbers in common bean dropped to 49–67% in non-rotated conditions.

The provisional 2-year soft penalty is too lenient for Aphanomyces (10+ year persistence) in commercial settings. However:

- Garden peas, snap beans, and runner beans are different species with partially different pathogen susceptibility profiles; the 6–10 year commercial recommendation applies to peas and lentils specifically.
- Home garden scale and raised beds with imported soil typically have lower Aphanomyces inoculum than repeatedly cultivated field soils.
- The soft-penalty (rather than hard-exclusion) framing is appropriate: legumes are important nitrogen-fixers; excluding them entirely would harm the rotation's soil health benefits.

**Decision: Soft penalty = 4 years** (stricter than the 2-year provisional to reflect Aphanomyces persistence; remains softer than the commercial 6–8 year recommendation because home garden raised beds start with lower inoculum levels). Additionally, **legume-after-legume should carry a penalty** (see Section 3).

|                | Provisional | Recommended | Source                   |
| -------------- | ----------- | ----------- | ------------------------ |
| Hard exclusion | —           | —           | N/A                      |
| Soft penalty   | 2 yrs       | **4 yrs**   | NDSU; PNW Pest Handbooks |

---

### 2.8 Asteraceae — sallat, endiv, cikoria, kronärtskocka

**Driver disease: Sclerotinia drop (_Sclerotinia minor_, _S. sclerotiorum_)**

_Persistence:_

- Sclerotinia sclerotiorum/minor sclerotia: survive **3–5 years** in soil depending on conditions (Missouri IPM; Oklahoma State Extension). Upper-range estimate 8–10 years from some sources.
- Critical caveat: Sclerotinia has 400+ host species across most vegetable families. A 1-year rotation to brassicas, cucurbits, or tomatoes does not reduce Sclerotinia pressure; it may actually maintain or increase it. For lettuce drop specifically, rotation to cereals/grasses is the only effective rotation strategy (NC State Extension, Missouri IPM).
- Lettuce is not a "dangerous" family from a pest-buildup perspective otherwise — no clubroot, no white rot, no carrot fly equivalent.

The provisional 1-year soft penalty is reasonable for general disease hygiene but the Sclerotinia framing needs a note: the penalty is more about succession density (lettuce after lettuce) than a soil-pathogen-specific exclusion.

**Decision: Soft penalty = 2 years** (mild upward revision from 1 year; Sclerotinia sclerotia persist 3+ years, which means even a 1-year break leaves viable inoculum; 2 years is a minimal but meaningful buffer without over-penalising one of the easier rotation families).

|                | Provisional | Recommended | Source                       |
| -------------- | ----------- | ----------- | ---------------------------- |
| Hard exclusion | —           | —           | N/A                          |
| Soft penalty   | 1 yr        | **2 yrs**   | Missouri IPM; Oklahoma State |

---

### 2.9 Poaceae — majs, sockermajs

**Driver diseases: Corn smut (_Ustilago maydis_), leaf rust (_Puccinia_ spp.)**

_Persistence:_

- Corn smut spores survive in soil **up to 4 years** (UMN Extension; multiple sources). The disease also overwinters in crop debris.
- Corn smut is ubiquitous — airborne spores are the primary infection route, not soil inoculum. Rotation reduces soil inoculum but does not prevent infection from external sources.
- Leaf rust (_Puccinia_ spp.) is primarily airborne and does not build meaningful soil inoculum; rotation is not the primary control.
- Wheat and rye (if grown in a home garden) share some pathogen susceptibility with maize within Poaceae, but cross-contamination risk is low for most home gardeners.

**Decision: Soft penalty = 2 years** (confirmed; smut's 4-year soil persistence supports at least a 2-year rotation. Hard exclusion not warranted — corn smut in a home garden is annoying but not catastrophic, and airborne spread limits rotation's effectiveness anyway).

|                | Provisional | Recommended           | Source        |
| -------------- | ----------- | --------------------- | ------------- |
| Hard exclusion | —           | —                     | N/A           |
| Soft penalty   | 2 yrs       | **2 yrs** (confirmed) | UMN Extension |

---

## 3. Consolidated Recommended Rule Set

| Family         | Hard excl. (yrs) | Soft penalty (yrs) | Primary driver                               | Key source                          |
| -------------- | ---------------- | ------------------ | -------------------------------------------- | ----------------------------------- |
| Brassicaceae   | **6**            | —                  | Clubroot 20-yr persistence                   | Jordbruksverket p7_7; RHS club-root |
| Alliaceae      | —                | **4**              | White rot 20–40 yr persistence               | RHS; UC IPM; U Maine #2062          |
| Solanaceae     | **4**            | —                  | Verticillium 7–14 yrs                        | NC State Extension; Coleman Ch. 7   |
| Cucurbitaceae  | —                | **3**              | Fusarium 4–5 yrs                             | PNW Pest Handbooks                  |
| Apiaceae       | —                | **2**              | Carrot fly annual cycle; Sclerotinia 3–5 yrs | RHS; Missouri IPM                   |
| Chenopodiaceae | —                | **3**              | Cercospora 3 yrs in debris                   | Cornell CCE; UMass Amherst          |
| Fabaceae       | —                | **4**              | Aphanomyces 10+ yrs; autotoxicity            | NDSU; PNW Pest Handbooks            |
| Asteraceae     | —                | **2**              | Sclerotinia 3–5 yrs                          | Missouri IPM; Oklahoma State        |
| Poaceae        | —                | **2**              | Corn smut 4 yrs in soil                      | UMN Extension                       |

**Why hard exclusion vs. soft penalty?**
Hard exclusion is reserved for families where the disease driver is (a) catastrophic — capable of destroying an entire brassica season or solanaceae harvest, (b) persistent enough that a partial-season rotation is genuinely meaningful, and (c) does not affect enough other families to make avoidance impossible. Soft penalty is used where the disease is either: ubiquitous-host (Sclerotinia), better managed by hygiene than rotation (white rot), or where the family is too important agronomically to exclude (Fabaceae as a nitrogen fixer).

---

## 4. Legume-Predecessor Bonus

### 4.1 Is the N-fix benefit real and quantified?

Yes, and the numbers are well-established.

**Garden peas (_Pisum sativum_):**

- Biological N fixation: **36.6–125.3 kg N/ha** (Frontiers in Sustainable Food Systems, 2021; ranges reflect soil conditions and inoculation).
- Another measurement: up to 180 kg N/ha fixed in favourable conditions (SEEDFORWARD cultivation guide).
- **Net residual N for the following crop** (after subtracting N removed in the grain harvest): average **18 kg N/ha**, ranging from −21 to +73 kg N/ha (Tandfonline, _Acta Agriculturae Scandinavica B_, 2005; 15N dilution method studies).

**Common beans (_Phaseolus vulgaris_):**

- Biological N fixation: **16.3–71.9 kg N/ha** (Frontiers, 2021). Lower than peas.

**Fava beans (_Vicia faba_):**

- Generally higher fixation than garden peas; fix up to 200+ kg N/ha (Frontiers, 2021), though most of this is consumed by the crop itself.

**The 18 kg/ha net residual figure** is the most honest number for the following-crop benefit: it is the N remaining in root residues and rhizodeposition after the harvest removes most of the fixed N in the seed. This is meaningful but modest — roughly the N content of 3–4 kg of a typical balanced organic fertiliser per 100m².

**Coleman's sequencing rationale (Chapter 7):** "Peas fix nitrogen for the following crop... beans add more nitrogen... the cabbage family follows peas because the ground is cleared early allowing a vigorous green manure to be established." The 8-part sequence (potatoes → sweet corn → cabbages → **peas** → tomatoes → **beans** → root crops → squash) explicitly positions both legume families as nitrogen builders for the heavy-feeder families that follow.

### 4.2 Which successor families benefit most?

**High N-demand successors (benefit most):**

- **Brassicaceae** (kål, broccoli): total N uptake 200–400 kg N/ha; broccoli can use 300 kg N/ha at peak head formation (Yara UK nutrient summaries; VT Research VTechWorks 2018). Clearly the primary beneficiary.
- **Solanaceae** (tomat, paprika): moderate-to-high N demand; potatoes and tomatoes are confirmed successors in Coleman's sequence and multiple extension rotation guides.
- **Cucurbitaceae** (gurka, squash): moderate N demand; extension guides confirm cucurbits benefit from legume precursor (Penn State Cover Crops for Nitrogen guide).
- **Poaceae** (majs): high N demand; ~35% of maize N after pigeon pea was shown by isotope dilution to derive from N fixation (Frontiers, 2021). Maize is the most-studied legume-successor crop in the scientific literature.

**Lower N-demand successors (modest benefit):**

- **Chenopodiaceae** (rödbeta, mangold): moderate N demand; benefits from residual N but N is not the primary limiting factor.
- **Asteraceae** (sallat): N recommendations for lettuce are 60–90 lb/ac (~67–100 kg N/ha) — significantly lower than brassicas (200–400 kg N/ha). Lettuce benefits from good soil fertility but is not a "heavy feeder" in the same league as brassicas.
- **Apiaceae** (morot): relatively low N demand; carrots grown in nitrogen-rich soil tend toward excessive top growth and forked roots. **The legume bonus should NOT apply to Apiaceae** — root crops benefit from phosphorus and potassium, not surplus nitrogen.

**Should the bonus magnitude vary per successor?**
Yes, if precision is the goal; no, if simplicity matters. The practical difference between a -15pp bonus for brassicas and a -10pp bonus for chenopodiaceae is small relative to the imprecision in the underlying data (net residual N ranges from -21 to +73 kg/ha). A flat bonus for "high-N-demand families" with Apiaceae explicitly excluded is the better trade-off.

### 4.3 Should there be a legume-after-legume penalty?

Yes. The evidence is clear:

- **Autotoxicity**: allelochemicals from pea/bean residues inhibit germination and reduce yield of the same or closely related legume species; pod numbers in replanted beans dropped to 49–67% (Assaduzzaman & Asao, _Scientia Horticulturae_ 2011).
- **Disease buildup**: pea monoculture increased root rot severity threefold compared to diversified rotations (reviewed in Global Bean Project, 2018).
- **Industry standard**: commercial pulse growers use 6–10 year breaks specifically because of fatigue buildup.

The Fabaceae soft-penalty of 4 years already covers this partially, but there is a qualitative difference between "Fabaceae in this bed recently" (soft penalty) and "Fabaceae immediately before this Fabaceae candidate" (stronger autotoxicity signal). The legume-after-legume case should apply the soft penalty at the maximum end of the window — i.e., Fabaceae immediately follows Fabaceae → apply full soft penalty + a short "do not place legume directly after legume" rule in the suggestion text.

### 4.4 Legume-Predecessor Bonus Table

The bonus applies when Fabaceae was grown in the bed in the **previous season** (1 growing year), and the candidate crop is a nitrogen-demanding successor.

| Predecessor | Successor family | Bonus direction         | Magnitude  | Rationale                                                                                             | Key source                                    |
| ----------- | ---------------- | ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Fabaceae    | Brassicaceae     | Negative (ranks higher) | **−15 pp** | Highest N demand (200–400 kg N/ha); primary beneficiary in Coleman sequence                           | Frontiers 2021; Yara UK; Coleman Ch. 7        |
| Fabaceae    | Solanaceae       | Negative (ranks higher) | **−15 pp** | Moderate-high N demand; confirmed in Coleman sequence                                                 | Coleman Ch. 7; Frontiers 2021                 |
| Fabaceae    | Cucurbitaceae    | Negative (ranks higher) | **−10 pp** | Moderate N demand; benefits from residual N                                                           | Penn State CCE                                |
| Fabaceae    | Poaceae          | Negative (ranks higher) | **−10 pp** | High N demand; best-studied legume-successor system                                                   | Frontiers 2021 (isotope dilution studies)     |
| Fabaceae    | Chenopodiaceae   | Negative (ranks higher) | **−10 pp** | Moderate N demand; benefits but less dramatically than brassicas                                      | General rotation guides                       |
| Fabaceae    | Asteraceae       | Negative (ranks higher) | **−10 pp** | Lower N demand but still benefits from improved soil fertility                                        | General agronomics                            |
| Fabaceae    | Apiaceae         | No bonus                | **0 pp**   | Root crops do not benefit from high residual N (causes forked roots in carrots, excessive top growth) | Multiple extension guides                     |
| Fabaceae    | Alliaceae        | No bonus                | **0 pp**   | Alliums have low-medium N demand; N residue does not distinguish alliums as a primary beneficiary     | —                                             |
| Fabaceae    | Fabaceae         | Penalty (ranks lower)   | **+15 pp** | Autotoxicity + disease buildup; legume fatigue                                                        | Global Bean Project; Assaduzzaman & Asao 2011 |

**Note on bonus magnitude variation:** Two tiers are used (−15 pp for top-tier heavy feeders, −10 pp for moderate beneficiaries) rather than a flat value. The 1.5x differential reflects the documented 2–4x gap in N demand between brassicas and lettuce-class crops. Implementing this requires the successor family to be looked up against a bonus-lookup table in the rotation rule set.

**Swedish-language advice string (for UI surface):**
"Bra växtföljd — ärtorna/bönorna från förra året har bidragit med kväve i jorden."

---

## 5. Scoring Magnitudes

### Current companion-planting scale

From `server/services/suggestion.service.ts` (lines 211–212):

```
COMPANION_GOOD_DELTA = -15  (surfaces candidate faster)
COMPANION_BAD_DELTA  = +25  (pushes candidate down)
```

The asymmetry is intentional: bad pairs are penalised more aggressively (+25) than good pairs are rewarded (−15). This is correct agronomic weighting — a harmful companion is worse than a good one is helpful.

### Should rotation deltas be steeper than companion deltas?

**Argument for steeper rotation penalty:**
Rotation is a temporal signal (pathogen _already in soil_), whereas companion planting is a spatial/chemical signal (allelopathy, pest confusing). Soil-borne pathogens are categorically harder to remediate than companion-planting mismatches. A clubroot-infected bed cannot be "fixed" this season; a bad companion pair can simply be moved.

**Argument for parity:**
The soft-penalty families (Alliaceae, Cucurbitaceae, etc.) have penalty windows of 2–4 years, meaning the engine encounters them rarely — a strong penalty is less likely to create ranking disruptions than if it were applied continuously.

**Recommendation:**

- **Soft rotation penalty: +25 pp** (matches `COMPANION_BAD_DELTA`; rotation pressure is at least as strong an agronomic signal as a bad companion pair; aligning the values keeps the scoring model simple to reason about).
- **Hard exclusion**: candidate is dropped from ranking entirely (not a score adjustment — same as the existing family-filter logic, just with a longer lookback window per family).
- **Legume bonus: −15 pp for top tier (Brassicaceae, Solanaceae), −10 pp for moderate tier**. The −15 pp matches `COMPANION_GOOD_DELTA` — making a legume predecessor exactly as valuable as a good companion. This is a reasonable anchor because both signals are "this bed is a better choice for this crop right now." The −10 pp for moderate beneficiaries is two-thirds of that signal.
- **Legume-after-legume penalty: +15 pp** (half the bad-companion penalty; autotoxicity is real but less acute than, say, clubroot; the 4-year soft-penalty window already does most of the work).

| Signal                       | Delta         | Rationale                                                                                 |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| Soft rotation penalty        | **+25 pp**    | Matches companion bad-pair; rotation pressure ≥ companion pressure                        |
| Hard exclusion               | Drop entirely | Disease risk too high to rank at all                                                      |
| Legume bonus (top tier)      | **−15 pp**    | Matches companion good-pair; predecessor N benefit ~ good neighbour benefit               |
| Legume bonus (moderate tier) | **−10 pp**    | Two-thirds of top-tier; reflects lower N demand                                           |
| Legume-after-legume penalty  | **+15 pp**    | Autotoxicity real but less acute than pathogens; partially covered by soft-penalty window |

---

## 6. Decisions Made — Final Values for Seed Data

These are the values to implement in the rotation rule set. Every number has a source chain; inline comments should reference this document.

```
Brassicaceae:  hardExclusionYears: 6,  softPenaltyYears: 0
Alliaceae:     hardExclusionYears: 0,  softPenaltyYears: 4
Solanaceae:    hardExclusionYears: 4,  softPenaltyYears: 0
Cucurbitaceae: hardExclusionYears: 0,  softPenaltyYears: 3
Apiaceae:      hardExclusionYears: 0,  softPenaltyYears: 2
Chenopodiaceae:hardExclusionYears: 0,  softPenaltyYears: 3
Fabaceae:      hardExclusionYears: 0,  softPenaltyYears: 4,  legumePredecessorBonus: true
Asteraceae:    hardExclusionYears: 0,  softPenaltyYears: 2
Poaceae:       hardExclusionYears: 0,  softPenaltyYears: 2
```

**Scoring constants:**

```
ROTATION_SOFT_PENALTY   = +25  // pp added to demand-gap score (ranks lower)
LEGUME_BONUS_HIGH       = -15  // pp for Brassicaceae, Solanaceae successors
LEGUME_BONUS_MODERATE   = -10  // pp for Cucurbitaceae, Poaceae, Chenopodiaceae, Asteraceae
LEGUME_AFTER_LEGUME_PENALTY = +15  // pp when Fabaceae follows Fabaceae
```

**Families excluded from legume bonus:**

- Apiaceae (high residual N causes forked roots, excessive top growth in carrots/parsnips)
- Alliaceae (low-medium N demand; not a primary legume-rotation beneficiary)

**Hard-exclusion logic change:**
Replace the flat `ROTATION_LOOKBACK_DAYS = 730` with a per-family lookup. Hard-exclusion families (Brassicaceae: 6 yrs, Solanaceae: 4 yrs) use full candidate-drop logic. Soft-penalty families use the score-adjustment path, not the filter path.

---

## 7. Sources

- [RHS — Club Root disease factsheet](https://www.rhs.org.uk/disease/club-root)
- [RHS — Onion White Rot disease factsheet](https://www.rhs.org.uk/disease/onion-white-rot)
- [RHS — Crop Rotation guidance](https://www.rhs.org.uk/vegetables/crop-rotation)
- [Jordbruksverket — Växtföljd i ekologisk grönsaksodling (p7_7 PDF)](https://www2.jordbruksverket.se/webdav/files/SJV/trycksaker/Pdf_ovrigt/p7_7.pdf)
- [Jordbruksverket — Odlingsbeskrivningar för ekologiska grönsaker (p7_24 PDF)](https://www2.jordbruksverket.se/webdav/files/SJV/trycksaker/Pdf_ovrigt/p7_24.pdf)
- [UC IPM — White Rot of Onion and Garlic](https://ipm.ucanr.edu/agriculture/onion-and-garlic/white-rot/)
- [UC IPM — Late Blight of Potato and Tomato](https://www.apsnet.org/edcenter/pdlessons/Pages/LateBlight.aspx)
- [University of Maine Cooperative Extension — Bulletin #2062, White Rot of Garlic and Onions](https://extension.umaine.edu/publications/2062e/)
- [Pacific Northwest Pest Management Handbooks — Onion White Rot](https://pnwhandbooks.org/plantdisease/host-disease/onion-allium-cepa-white-rot)
- [Pacific Northwest Pest Management Handbooks — Pea Aphanomyces Root Rot](https://pnwhandbooks.org/plantdisease/host-disease/pea-pisum-sativum-aphanomyces-root-rot)
- [Cornell Cooperative Extension — Rotating Vegetables by Family](https://schenectady.cce.cornell.edu/gardening/food-gardening/rotating-vegetables-by-family)
- [Cornell Vegetables — Cercospora Leaf Spot of Table Beet](https://www.vegetables.cornell.edu/pest-management/disease-factsheets/cercospora-leaf-spot-of-table-beet/)
- [UMass Amherst — Cercospora Leaf Spot of Swiss Chard, Beets, and Spinach](https://www.umass.edu/agriculture-food-environment/vegetable/fact-sheets/cercospora-leaf-spot-of-swiss-chard-beets-spinach)
- [NC State Extension — Verticillium Wilt of Tomato and Eggplant](https://content.ces.ncsu.edu/verticillium-wilt-of-tomato-and-eggplant)
- [UMN Extension — Common Smut on Corn](https://extension.umn.edu/corn-pest-management/common-smut-corn)
- [Missouri IPM — Monitoring, Detection and Management of Lettuce Drop caused by Sclerotinia spp.](https://ipm.missouri.edu/MEG/2016/2/Monitoring-Detection-and-Management-of-Lettuce-Drop-caused-by-Sclerotinia-spp/)
- [Oklahoma State University Extension — Sclerotinia Drop, Lettuce Drop, or White Mold](https://extension.okstate.edu/programs/digital-diagnostics/plant-diseases/sclerotinia-drop-lettuce-drop-or-white-mold.html)
- [NDSU Agriculture — Dry Pea and Lentil Root Rot Management Guide](https://www.ag.ndsu.edu/publications/crops/dry-pea-and-lentil-root-rot-management-guide)
- [Saskatchewan Pulse Growers — Aphanomyces Root Rot in Pulse Crops](https://saskpulse.com/resources/aphanomyces-root-rot-in-pulse-crops/)
- [Global Bean Project — Legume Fatigue: Prevention Is Better Than a Cure](https://www.globalbean.eu/articles/legume-fatigue/)
- [Frontiers in Sustainable Food Systems — Contribution, Utilization, and Improvement of Legumes-Driven Biological Nitrogen Fixation](https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2021.767998/full)
- [Tandfonline — Nitrogen fixation and residual effects of field pea intercropped with oats (Acta Agriculturae Scandinavica B)](https://www.tandfonline.com/doi/full/10.1080/0906471051003122)
- [Assaduzzaman & Asao — Autotoxicity in beans and their allelochemicals, Scientia Horticulturae 2011](https://www.sciencedirect.com/science/article/abs/pii/S0304423811006315)
- [Frontiers in Plant Science — Tackling Control of a Cosmopolitan Phytopathogen: Sclerotinia (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8417578/)
- [Yara UK — Vegetable Brassica Nutritional Summary](https://www.yara.co.uk/crop-nutrition/vegetable-brassicas/vegetable-brassica-nutritional-summary/)
- [Annual Reviews of Phytopathology — Clubroot Disease: 145 Years Post-Discovery](https://www.annualreviews.org/content/journals/10.1146/annurev-phyto-121323-020949)
- [Phytopathology — _Plasmodiophora brassicae_ in its Environment: Effects of Temperature and Light on Resting Spore Survival in Soil](https://apsjournals.apsnet.org/doi/10.1094/PHYTO-09-20-0415-R)
- [Penn State Extension — Growing Cover Crops for Nitrogen on Vegetable Farms](https://extension.psu.edu/growing-cover-crops-for-nitrogen-on-vegetable-farms)
- [Eliot Coleman, _The New Organic Grower_, 3rd (30th Anniversary) Edition — Chelsea Green, 2018](https://www.chelseagreen.com/product/the-new-organic-grower/) (Chapter 7: Crop Rotation)
- [Elysian Fields Gardens — Eliot Coleman's Crop Rotation Sequence summary](http://elysianfieldsgardens.blogspot.com/2009/12/eliot-colemans-crop-rotation.html)
