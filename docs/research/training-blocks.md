---
title: Training blocks for runplan (research)
summary: What the evidence says about blocks, intensity distribution, long runs, injury spikes and tapering, and what runplan should do with it
type: research
updated: 2026-11-09
---


> Background for replacing `phases` with **blocks** in runplan (a block is a stretch of weeks with one purpose, e.g. "base", "marathon-specific", "taper", and the plan is written inside it). This file collects what the evidence says, so the block model, the on-track rules and the suggestions rest on something. Design decisions: [runplan training blocks](../decisions/runplan-training-blocks.md) (being settled).

## 1. What "block" means

Two meanings are in use, and the app needs both:

- **In the literature (Issurin's block periodization):** short mesocycles of **2–4 weeks** with highly concentrated loads, run in sequence: *accumulation* (basic abilities: aerobic base, volume), *transmutation* (sport-specific abilities: race pace, threshold), *realization* (recovery and peaking). Other variants use ~1-week blocks focused on one ability. [Mølmen et al. 2019, systematic review]
- **In runner/cyclist speech:** "my marathon block" = the last 8–16 weeks before a race, which is really a sequence of mesocycles (build → specific → taper).

**Implication:** a block in the app has a free length (1–16 weeks) and a kind. "Marathon block" is then the user's name for a block, or a run of blocks leading to a race; it does not need its own entity.

## 2. How strong is the evidence for block periodization?

Meta-analysis of block vs traditional (mixed) periodization in endurance athletes: 6 parallel-design studies, 107 subjects. Small effects in favour of blocks:

- VO2max: SMD 0.40 (95% CI 0.02–0.79)
- Peak power: SMD 0.28 (95% CI 0.01–0.54)
- Prediction intervals include zero; mean PEDro score 3.7/10; interventions were short (mean ~4.9 weeks) and mostly in well-trained athletes. The authors note it is hard to separate "blocks" from "simply varying the stimulus".

[Mølmen, Øfsteng & Rønnestad 2019]

**Implication:** blocks are worth having as an **organising tool** (clear purpose per period, easier overview, judgement per period), not as a physiological rule the app enforces. The app should describe and nudge, not prescribe.

## 3. Intensity distribution per kind of block

From Stöggl & Sperlich's review of training-intensity distribution (zones: low < first threshold, threshold between, high > second threshold):

- Most endurance athletes train **pyramidal**: roughly 70–90 % low intensity, less threshold, very little high. Polarized (e.g. ~78/4/18 in marathon-focused runners) appears less often.
- **Preparation / base:** low-intensity share highest, about **84–95 %**.
- **Pre-competition / specific:** threshold and high-intensity shares rise (cyclists: 88/11/2 → 78/17/5 → 77/15/8 from active rest to competition).
- Doubling low-intensity volume in elite athletes did not improve performance further; overdoing threshold work (> ~20 %) may impair recovery.
- **Measuring it:** time-in-zone by heart rate lags at the start of hard efforts, so short intervals get under-counted; classifying each session by its goal ("session goal") or sRPE is an accepted alternative.

[Stöggl & Sperlich 2015]

**Implication for on-track:** each block kind gets an *expected* easy share. runplan already has HR zone seconds per activity and a planned type per workout, so it can compare both ways: "planned easy sessions ran easy" (time in Z1–2 per easy-labelled session) and the overall Z1–2 share across the block.

## 4. Volume and long run — what predicts race result

Cohort of 997 recreational runners (556 half, 441 full marathon), self-reported training 2–6 weeks before the race [Fokkema et al. 2020]:

| | Faster | Slower |
|---|---|---|
| Half marathon | > 32 km/week (−4.2 min); longest run > 21 km (−3.9 min) | — |
| Marathon | > 65 km/week (−14.1 min vs 40–65 km) | < 40 km/week (+6.3 min); longest run < 25 km (+13.4 min) |

- Longest run > 35 km gave **no** further benefit over 30–35 km.
- Volume, longest run and pace were **not** associated with injuries in this cohort.

**Implication:** for a block heading to a race, two numbers are worth showing: weekly volume relative to these bands, and the longest run in the block relative to the race distance. They are good "you might want to…" hints, not pass/fail.

## 5. Injury risk — what to warn about

Prospective cohort, 5,205 runners, 588,000 GPS-recorded sessions over 18 months [Frandsen et al. 2025, BJSM]:

- A **single run longer than the longest run in the previous 30 days** was the signal. Compared with ≤ 10 % over that longest run: > 10–30 % → HRR 1.64; > 30–100 % → 1.52; > 100 % → 2.28.
- **No clear association** for ACWR (week vs previous three) or week-to-week change in total distance.

**Implication:** the classic "10 % per week" rule matters less than the longest-run step. When a block is planned, the app can check each planned long run against the longest run in the 30 days before it (actual runs + earlier planned ones) and flag steps > 10 %. This is cheap and evidence-based. The existing week-over-week `rampRatio` should be demoted.

## 6. Taper

Bosquet et al. 2007 meta-analysis (27 studies):

- Duration about **2 weeks**
- Volume cut **41–60 %**, exponentially (progressive)
- **Intensity and frequency kept**

[Bosquet et al. 2007, via SDSU Coaching Science Abstracts]

**Implication:** this is the basis for the race suggestion ("Göteborgsvarvet in 2 weeks: cut volume ~40–60 %, keep the quality sessions and number of runs"). A taper block can be judged on these three things directly: volume down ~40–60 % from the block before, key sessions still there, number of runs roughly unchanged.

## 7. Backoff weeks (3:1, 2:1)

A lighter week every 3rd–4th week is standard coaching practice and already in runplan's quick-add (`backoff`). There is little direct trial evidence on the exact ratio. Treat it as a convention the user chooses, not a rule. On-track for a backoff week means "volume clearly lower", not "hit the number".

## 8. Summary — what the app should do with this

1. Blocks are an organising tool with a kind and a free length; no enforced structure.
2. Each block kind has a default profile: expected easy share and what "on track" means (base: volume + easy share; specific: key sessions; taper: volume cut with intensity kept).
3. Flag planned long runs > 10 % longer than the longest run in the preceding 30 days.
4. For an upcoming A race: suggest a taper of ~2 weeks, 40–60 % less volume, same intensity and frequency; show weekly volume and longest run against the Fokkema bands.
5. Fitness projection (CTL) ends where the plan ends; no zero-filled extrapolation to race day.

## Sources

- Mølmen KS, Øfsteng SJ, Rønnestad BR. *Block periodization of endurance training – a systematic review and meta-analysis.* Open Access J Sports Med 2019;10:145–160. https://pmc.ncbi.nlm.nih.gov/articles/PMC6802561
- Stöggl TL, Sperlich B. *The training intensity distribution among well-trained and elite endurance athletes.* Front Physiol 2015;6:295. https://www.frontiersin.org/articles/10.3389/fphys.2015.00295/full
- Fokkema T et al. *Training for a (half-)marathon: training volume and longest endurance run related to performance and running injuries.* Scand J Med Sci Sports 2020. https://repub.eur.nl/pub/127621/Repub_127621_O-A.pdf
- Frandsen JSB et al. *How much running is too much? Identifying high-risk running sessions in a 5200-person cohort.* Br J Sports Med 2025. Summary: https://blogs.bmj.com/bjsm/?p=11751
- Bosquet L et al. *Effects of tapering on performance: a meta-analysis.* Med Sci Sports Exerc 2007;39(8):1358–65. Summary: https://coachsci.sdsu.edu/csa/vol131/bosquet.htm
