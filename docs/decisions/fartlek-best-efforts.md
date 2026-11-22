---
title: Fartlek best efforts, automatic critical speed and race prediction
summary: How Fartlek reads best efforts from stored streams, fits critical speed without a test, predicts race times week by week (marathon from published volume, durability and training models), and shows Garmin's VO2max
type: decision
status: accepted
updated: 2026-11-13
---

# Best efforts, automatic critical speed and race prediction

Item 2 of the [roadmap](fartlek-roadmap.md). Mocked first on the "Fartlek – bästa ansträngningar, CS och prognos" canvas; the user's ask was that none of it needs a dedicated session ("så man slipper köra ett pass för att få in de värdena").

## Decided

- **From what is already stored.** Best efforts are the longest distance in each of 1, 2, 3, 5, 8, 10, 12, 20, 30, 45, 60, 90 and 120 minutes of moving time, from any part of any run (interval reps count). They are read from the kept FIT file at 1 s, or the stored ~5 s stream when there is no file, never from Garmin again. A release backfills every run in the background and the pages finish any leftovers within a time budget. `EFFORTS_VERSION` in `server/efforts.ts` re-runs the extraction when it changes.
- **Grade-adjusted pace (GAP) when the watch recorded it, otherwise raw pace.** GAP is Garmin's undocumented field 140, the same one [step detection](fartlek-stream-steps.md) uses. The card says how many recent runs had it.
- **The curve compares the current block with the previous one**, or the last 6 weeks with the 6 before when there is no previous block. 42 days is intervals.icu's default comparison window and the same as fitness (CTL). There is a toggle between the two, and all-time bests show as a thin line. It is a card in Trends next to critical speed, not a page of its own: Trends already has about ten charts.
- **Critical speed is fitted automatically** from the best 3, 5, 8, 10 and 12 minute efforts of the last 84 days (at least three durations), with the existing `fitCriticalSpeed`. **A test newer than every effort in the fit wins**, until newer runs give a newer estimate. An older test is shown with a note on why it isn't used. When D′ is under 100 m, the card warns that the efforts were probably not all-out (threshold reps, say), so CS likely reads low.
- **Prediction, by distance.**
  - Up to 10 km: (distance − D′) ÷ CS.
  - Up to the half marathon: Riegel (exponent 1.06) from the effort of at least 20 minutes that predicts fastest. Vickers & Vertosick (2016, 2,303 recreational runners) found Riegel well calibrated up to the half but at least 10 min too fast at the marathon for half of the runners, so the half keeps the plain formula.
  - **Marathon: the median of three published models**, each shown with its inputs:
    - *Vickers & Vertosick Model 1*: speed = 0.16018617 + 0.83076202·v + 0.06423826·(weekly miles ÷ 10), with v the Riegel speed and weekly volume over 8 weeks. Reproduces the published 30 mi/week example to within 2 min.
    - *CS × durability* (Smyth et al. 2022, 82,303 marathons): runners with low (< 1.1), moderate (1.1–1.2) and high (≥ 1.2) heart-rate-to-speed decoupling ran at 88, 86 and 82 % of CS. Decoupling is taken from the user's steady long runs (≥ 90 min; last 20 min against minutes 10–30, grade-adjusted speed, skipped when pace changes > 15 %), median over 8 weeks. **This is a training-run proxy for Smyth's in-race 35–40 km vs 5–10 km ratio, not validated as such**: easy long runs likely drift less than a marathon, so the group may read optimistic.
    - *Tanda 2011*: Pm (s/km) = 17.1 + 140·exp(−0.0053·K) + 0.55·P from 8 weeks' mean weekly km and pace; re-validated (Tanda 2022) with an RMSE of 5.4 min between 2:47 and 3:36, flagged outside that range. Mean pace uses elapsed time, so stops make it a little slow.
    - Each model needs its inputs; the median of those available is the prediction, Riegel when none are.
  - Between the half and the marathon: on the power law through those two predictions.
  - A prediction for each week end over 26 weeks, from the 84 days of efforts and 8 weeks of training before it, with the goal as a reference line. The trend is the least-squares slope over the last 8 weekly points (one jump in a week no longer reads as "−107 s a week").
- **Asked for, not published:** a personal Riegel exponent adjusted for durability. No study gives such an adjustment; the models above are the published way to put volume and durability into the marathon. Blythe & Király (2016) show individual exponents exist, but fitting one needs several all-out long efforts, which training data mostly lacks (long runs are easy), so it is left out.
- **Garmin's race prediction is not used.** With a personal API key `metrics-service/metrics/racepredictions` is 404 for every variant, with the right display name (from `userprofile-service/userprofile/settings`; `socialProfile` is 404 too), while `metrics-service/metrics/maxmet/daily/{from}/{to}` answers. The user asked to drop the comparison altogether.
- **VO2max from Garmin** is synced (a year on the first sync, then two weeks) and shown as a trend card in Trends with the change over 8 weeks.
- The race hints no longer show "0 km/week" for build weeks with nothing run or planned yet.

## Passed over

- A page of its own for the curve (Trends is already long).
- Raw pace only (simpler, but unfair to hilly runs).
- Showing CS from tests and from runs side by side without choosing one.
- One formula (Riegel) for every distance.

## Open

- Whether the training-run decoupling proxy matches marathon decoupling well enough; check against real marathon results once there are some.
- Whether interval-heavy blocks give a D′ low enough that the automatic CS needs a correction, or only the warning.
