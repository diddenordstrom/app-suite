---
title: Fartlek uses races as the answer key for its predictions
summary: Races get results (from "Was this a race?" on a run, or added by hand), and each is logged with what every prediction model said the day before and the inputs, per model version; shown as an answer key, never changing the prediction
type: decision
status: accepted
updated: 2026-11-13
---

# Fartlek uses races as the answer key for its predictions

Mocked on 2026-11-13 in the Claude Design canvas **"Fartlek – lopp som facit"**. It started from a half marathon as a reference for the [race predictions](fartlek-best-efforts.md), and grew into a log of "Fartlek said X, you ran Y" to tune the models on later.

## Decided

- **Only races are compared.** The user first thought of every all-out effort at 5, 10, 21 and 42 km, then settled on races: a hard training run has no taper and no race day, so comparing against it would be noise.
- **Races get a result** (`resultSeconds`) and the run it was (`activityId`) on the existing races table. Two ways in, both on the Races page and the run, not in Settings (a Runna-style setup step can reuse the same form later):
  - **"Var det här ett lopp?"** on a run, like the threshold suggestion. Asked when **Garmin marked it as a race** (`eventType.typeKey = race`, now synced: the first sync after the release pages back through every activity once to read it), or when it is a **standard distance** (5, 10, 21.1, 42.2 km; 1 % short to 3 % long, as watches read long) run hard for its length (average HR at least 97 / 96 / 93 / 86 % of threshold HR). Yes saves it onto the race planned that day, or as a new past race (priority B); no is remembered. Not asked for runs older than a year.
  - **"+ Lägg till tidigare lopp"** and **"Lägg in tid"** on past races, with the Garmin run of that day suggested and linked.
- **No "bad conditions" flag** (heat, hilly course): the user found it unnecessary.
- **The log** (`race_checks`): per race and model version, what every model said **the day before** (efforts, CS test and training up to then), the shown prediction, and the inputs (CS, D′ and their source, weekly km, mean pace, decoupling, CTL). Critical speed is logged for every distance as a diagnostic, Riegel up to the marathon, the three marathon models at the marathon. Past races are backfilled on first view, since the day-before prediction can be worked out from stored data. A new model version adds rows and keeps the old ones; a corrected result updates the answer, never the prediction.
- **Shown, not applied:** "Facit från dina lopp" under the first upcoming race's prediction (or under past races when there is none): Fartlek sa / Du sprang / Skillnad and model by model. The prediction does not change; weighting the models by how well they hit is for when there are several races.
- Past races list their result with "Fartlek sa … · x snabbare".

## Open

- When there are a few races: weight the marathon median by each model's record, or calibrate per runner.
