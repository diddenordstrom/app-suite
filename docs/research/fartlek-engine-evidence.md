---
title: What Fartlek's planning engine rests on (research, convention, our own choice)
summary: Every rule and number of the block and week engine, with its source and how strong that is, so a tweak knows whether it touches research or a rule of thumb; the engine's goal outside a race block in one line
type: research
updated: 2026-11-25
---

# What Fartlek's planning engine rests on

Asked for by the user on 2026-11-25: "I don't want to make up values; base it on form and slow progression to get the most fitness and km a week with the least injury risk." This page lists what each rule rests on, so that a change knows whether it moves research or a number we chose. Sources are read from their abstracts and from summaries, not always the full texts; where a claim leans on a summary it says so.

## The engine's goal

Outside a race block: **as much aerobic fitness and weekly volume as possible, at the lowest injury risk, by slow, steady progression**, with form as a brake against piling up fatigue. Inside a race block (an A race within reach): the same, then the race-specific phase and a taper that lands race-day form in its window.

## Strength of the ground

- **Research**: a study or meta-analysis supports the rule and roughly its size.
- **Direction**: research supports the direction, the number is ours.
- **Convention**: what coaches and published plans do; no study fixes it.
- **Our choice**: a number picked to make the engine behave; tune it with the simulator (`npm run sim -w apps/fartlek`).

## Rules

| Rule | Where | Ground | Source |
|---|---|---|---|
| **No session more than 10 % over the longest run of the last 30 days** | `NEXT.spike`, `NEXT.spikeDays`, `spikeMax` | **Research** | Frandsen et al., BJSM 2025: in 5,200 runners a single session longer than the longest of the last 30 days, above all by more than 10 %, raised the injury rate; weekly and monthly volume changes mattered less. Observational. The engine's main guard. |
| Weekly volume may grow more than 10 % at low volume (+2.5 km a build week under 40 km, `weekCap` at least +2.5 km) | `NEXT.lowStepKm`, `NEXT.lowVolumeKm` | **Direction** | Nielsen et al., JOSPT 2014 (873 novices): more than about 30 % growth over two weeks went with more distance-related injuries than under 10 %; 10–30 % did not differ clearly. Buist et al., AJSM 2008 (RCT, novices): a graded program in 10 % steps did not lower injuries. So "10 % a week" has little support; 2.5 km and 40 km are ours. |
| A week grows at most 10 % above that (`COACH.weekGrowth`) | `COACH.weekGrowth` | **Convention** | The "10 % rule"; see Buist 2008 above for how little it rests on. Kept as a careful default. |
| Block ramp: build weeks at 100 → 110 % of the proven load, then a lighter week | `TUNE.ramp` | **Our choice**, convention in shape | Progressive overload with planned unloading is standard coaching; the 10 % per block is ours. Re-entry to a load already run (up to +30 %, `NEXT.reentryGrowth`) follows the idea that tolerated load is the safe reference (Gabbett, BJSM 2016), not a measured number. |
| 3:1 rhythm, lighter week at 70 % | `TUNE.lighter` | **Convention** | Common in coaching and published plans; no study fixes 3:1 or 70 %. |
| Km ramp limit (week against the mean of four weeks, `COACH.rampCap`, `COACH.rampRisk`) | `COACH` | **Convention, contested** | The acute:chronic workload ratio (Gabbett 2016) was widely used; Impellizzeri et al., IJSPP 2020, showed conceptual and statistical problems with it. Kept as a soft brake, not trusted as a risk measure. |
| Form (fitness − fatigue) as a brake, bands as a share of fitness | `FORM`, `COACH.floor`, `COACH.goal` | **Model, bands are convention** | Banister's impulse-response model (1975) describes fatigue and performance, not injury. The bands follow intervals.icu's convention. Good for "too much fatigue piling up", not a validated injury threshold. |
| Load per session: run by pace against threshold pace (rTSS), else heart rate (hrTSS), else time | `activityLoad` in `shared/load.ts` | **Convention** | TrainingPeaks-style TSS. Consistent within the app, not a measure of tissue stress. Session RPE × minutes (Foster et al., JSCR 2001) is a validated alternative for internal load; the app logs sRPE but does not use it for load yet. |
| Long run on a ladder: +8 % a step, at least 1 km | `TUNE.long.stepShare`, `stepMinKm` | **Our choice** | Bounded by the spike rule above, which carries the evidence. |
| Long run as a share of the week (about 30–46 %, falling with volume) | `TUNE.long` | **Convention** | Daniels: long run at most about 25–30 % of the week or 150 min. Our curve is looser at low volume. |
| Marathon plan: long run up to 40 % of the week off the track; a long-run track of five runs of 26–32 km planned back from the race, up to 50 % of the week on it; peak-week cap 1.75 × the proven peak | `RACE_PLAN.marathonLongShare`, the long-run track ([fartlek-marathon-long-run-plan.md](../decisions/fartlek-marathon-long-run-plan.md)) | **Convention** | Marathon plans aim at a handful of 26–32 km runs; low-volume plans (Higdon's Novice plans: about 32 km on 55–65 km weeks) put about half the week in the long run. No study sets five runs, 30 km, 50 % or 1.75 ×. |
| Long run ceiling 32 km and 3 h (3.5 h in a marathon plan) | `NEXT.longCeiling` | **Convention** | Common coaching caps (time on feet); not research. |
| Easy runs at most half the long run | `TUNE.easy.ofLong` | **Our choice** | Keeps the long run the longest session. |
| Run days from volume (4 from 25 km, 5 from 50, …) | `TUNE.daysFromKm` | **Our choice** | Rule of thumb so no single run gets too long. |
| One threshold session a week, threshold work at most about 15 % of the week, strides on easy runs | `NEXT.qualityMax`, threshold ladder | **Direction** | Most volume easy, a little quality: the intensity distribution of trained endurance athletes (Seiler, IJSPP 2010). The 15 % and the ladder are ours. |
| Taper: about two weeks, volume down by roughly 40–60 %, intensity kept | `TUNE.taper`, the taper fit | **Research** | Bosquet et al., MSSE 2007 (meta-analysis): about two weeks, 41–60 % less volume, intensity and frequency kept, gave the best performance. The engine fits the depth to race-day form inside that range. |
| Race-day form window | `COACH.race` | **Convention** | From the form model's practice; not validated. |
| More weekly volume and faster training pace predict marathon time | Why volume is the goal | **Research, correlational** | Tanda, J Hum Sport Exerc 2011: weekly km and mean training pace predicted marathon time. Says more volume goes with faster times, not how fast to add it. |
| At least one strength session a week recommended | Gym days | **Research** | Lauersen et al., BJSM 2014 (meta-analysis of RCTs across sports): strength training cut sports injuries to under a third. Not running-specific. |

## What this means for tuning

- The **spike rule** and the **taper** rest on research: change them only with a new study in hand.
- **Weekly growth** has research for its direction (10 % a week is not needed for safety, much more than 30 % over two weeks is risky), so values between those are a fair choice, best checked on the simulator.
- **Form** is a fatigue brake, not an injury rule: keep it as a brake, don't add rules that chase a form target ([fartlek-form-relative.md](../decisions/fartlek-form-relative.md)).
- Everything marked **convention** or **our choice** is open to tuning, and the developer settings and the simulator are where to do it ([fartlek-simulator.md](../decisions/fartlek-simulator.md)).

## Open

- Using sRPE × minutes for load when a run has no pace or heart rate (a manual log), beside rTSS.
- Showing the ground (research or rule of thumb) beside each reason in "Så valde Fartlek", so the runner learns which rules are firm.
