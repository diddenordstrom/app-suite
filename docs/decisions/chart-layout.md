---
title: How Fartlek charts are laid out
summary: One y-axis per chart; stacked panels for a single activity's curves; a pill switch for related trends; no dual axes
type: decision
status: accepted
updated: 2026-11-14
---

# How Fartlek charts are laid out

## Decision

- **One y-axis per chart, never a dual axis.** Where two measures share a time axis they get their own panel, not a second axis (already the rule in [packages/ui charts](../../packages/ui/src/charts.tsx)).
- **One activity's curves stay stacked** (pace with elevation, heart rate, cadence) on one time axis with a shared crosshair and a readout of every value at that moment. The point there is reading the measures against the same second; a switch would hide that. See [fartlek-structured-workouts.md](fartlek-structured-workouts.md).
- **Related trends that answer different questions share a card behind a pill switch** (`SegmentedControl` in the card's header), one chart at a time. First use: *Lugna pass* on Trends, Tempo | Poäng. The ⓘ text follows the selected pill.
- Not merged for now: threshold pace and heart rate (their point is "faster at the same pulse", so stacked panels would suit them better than a switch) and HRV with resting heart rate. Open if wanted.
- Lines are drawn as monotone cubic curves (no overshoot), and `LineChart` names its series in the legend, not at the line ends; see [metric-info-tips.md](metric-info-tips.md) for where help text lives.

## Reasons

- Two axes let the scaling decide where lines cross, which suggests relationships that aren't there; separate panels or a switch avoid that.
- Trends points are sessions or days, so comparing two measures at the same instant matters less than on one run, and a switch halves the page height.
- Mocked in a Design canvas first; the user liked the pill switch on the easy-run card and kept the curves as they were.
