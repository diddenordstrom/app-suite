---
title: Fartlek's today's form is 10 minus a list of deductions
summary: Dagsform is built from sliding, weighted deductions (HRV, soreness, km ACWR, resting HR, pain, form, sleep); the verdict follows the score; pain 8+ vetoes for 3 days; mood and Body Battery are out
type: decision
status: accepted
updated: 2026-11-11
---

# Fartlek's today's form is 10 minus a list of deductions

## Decision

The question the score answers: **is the body up for today's planned session?** It never looks at the plan (D15 still holds: advice only). An over-optimistic plan should show up as a tired body after a week or two, a back-off week as a fresh one.

- The score is 10 minus the sum of deductions, rounded to a whole number (a tie like 8.5 rounds down). Every signal takes off up to its maximum, sliding linearly between two thresholds instead of jumping at one, rounded to half points. The thresholds live in `READINESS` in [shared/recovery.ts](../../apps/fartlek/src/shared/recovery.ts) and the ⓘ tips read the same constants (see [metric-info-tips](metric-info-tips.md)).

  | Signal | Measured as | Deduction | Max |
  |---|---|---|---|
  | HRV | Mean of the last 2 nights' HRV (`hrvLastNight`) vs Garmin's baseline low | 0 at the baseline low, full at 20 % under | 3 |
  | Soreness | Latest check-in, today or yesterday | 3/5 → 1, 4/5 → 2, 5/5 → 3 | 3 |
  | Km (ACWR) | Last 7 days' km vs the 28-day weekly average, today left out; needs 28 days of history | 1.3 → 0, 1.5 → full | 2 |
  | Resting HR | Mean of the last 3 calendar days vs the 28-day mean | 0.4 per beat above | 2 |
  | Pain | Pain logged in the last 7 days | 1 for a rising area, 1 for level 5+ | 2 |
  | Form (TSB) | Today's form from the load model | `FORM.heavy` (−25) → 0, −40 → full | 1.5 |
  | Sleep | Garmin's sleep score, latest night | 70 → 0, 40 → full | 1.5 |

- **Verdict follows the score:** 8–10 go, 6–7 take it easier, 5 or lower back off. The one exception is the **pain veto**: pain 8+ logged in the last 3 days (the day it was logged counts) says rest and caps the score at 2. After those days the same entry is an ordinary deduction.
- **Home says what took it down**, e.g. "9/10 Kör på! Sänkt 1 för smärta. Kör som vanligt om du inte har några känningar." Each signal row shows its own deduction.
- **Missing data costs nothing but is visible.** A signal without fresh data is grey ("ingen data"). When HRV or resting HR is missing, the score is shown grey with an asterisk ("8*") and a line saying what's missing. A value built on fewer days than its window (one HRV night, two resting-HR days) gets an asterisk on the row. The score stays null until something besides pain has data.
- **Out of the model:** mood (removed from the check-in too), the old manual sleep value, and Body Battery. Body Battery stays on Home as a plain Garmin info row that takes nothing off. The `sleep` and `mood` columns stay in the database unused.

## Reasons

- The old score (10 − 2 per bad signal, sleep and mood only on the score) and the old verdict (count of bad signals) could disagree: "6/10 – Kör på!". Deriving one from the other removes that, and a list of deductions is what you want to see as the developer and as the runner.
- Hard cut-offs flipped from nothing to −2 at 110 % or +5 beats; sliding deductions don't.
- Km stays its own signal next to form, not merged into it: form is fitness against fatigue, but in running it's often tendons that stop you when the km climb fast, and form doesn't see that. ACWR against 28 days is far less noisy than last week vs the week before (a sick week no longer makes a normal week look like +150 %).
- HRV and form overlap but aren't the same: form is what you did, HRV and resting HR are how the body took it. Heavy load with steady HRV is the good case.
- HRV over 2 nights rather than Garmin's weekly average catches the crash after a hard session; one night alone is too noisy, three dilute the crash (60, 60, 36 averages to 52, right at a typical baseline low).
- Resting HR uses calendar days so a watch that hasn't synced for a week doesn't get compared on week-old values.
- The pain veto used to follow the latest logged run, so "rest" stuck until you ran again, which you weren't supposed to.
- Mood: if the body is fine you should run even when a bit low. Body Battery is Garmin's own blend of HRV, sleep and stress, which the model already has as separate measurements.

## Passed over

- Gemini's draft (sliding km and resting HR, but verdict still from a count of "bad" signals with its own thresholds, decimal scores, mood kept, missing km history treated as ACWR 1.0).
- Taking the worse of ACWR and form as one load signal (see the tendon reason above).
- ACWR on TRIMP load instead of km.

## Open

- The weights and thresholds are a first guess and should be tuned on real weeks.
- Soreness still uses only the latest check-in (the 2–3 day average question from [fartlek-sleep-from-garmin](fartlek-sleep-from-garmin.md)).
