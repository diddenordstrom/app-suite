---
title: How Fartlek charts are laid out
summary: One y-axis per chart; stacked panels for a single activity's curves; a pill switch for related trends; no dual axes; trend cards share one anatomy (today's value on top, key numbers underneath)
type: decision
status: accepted
updated: 2026-11-23
---

# How Fartlek charts are laid out

## Decision

- **One y-axis per chart, never a dual axis.** Where two measures share a time axis they get their own panel, not a second axis (already the rule in [packages/ui charts](../../packages/ui/src/charts.tsx)).
- **One activity's curves stay stacked** (pace with elevation, heart rate, cadence) on one time axis with a shared crosshair and a readout of every value at that moment. The point there is reading the measures against the same second; a switch would hide that. See [fartlek-structured-workouts.md](fartlek-structured-workouts.md).
- **Related trends that answer different questions share a card behind a pill switch** (`SegmentedControl` in the card's header), one chart at a time. First use: *Lugna pass* on Trends, Tempo | Poäng. The ⓘ text follows the selected pill.
- Not merged for now: threshold pace and heart rate (their point is "faster at the same pulse", so stacked panels would suit them better than a switch) and HRV with resting heart rate. Open if wanted.
- **Trend cards share one anatomy** (`ChartCard` in [packages/ui](../../packages/ui/src/chartcard.tsx)): title with ⓘ and a one-line sub (the long explanation lives in ⓘ), today's value as a big number with a muted unit and one line of context (a date or a change, optionally a state badge or a progress bar), the chart drawn at its real width so axis text stays 11 px on a phone, then two or three key numbers that say something the chart doesn't. Colour only when something needs watching (heavy form, fading durability); what is going well stays neutral. First users: durability, kilometres per week, load and threshold pace on Trends. The other trend cards can follow when they get a value worth putting on top.
- **Zones are bands in the chart and named outside the plot**: in the legend (load's build zone, −25 to −10 % form, the same band as the block coach) or in a small scale under the chart (durability), never as labels at the right edge, which squeeze the plot on a phone. Splitting form into its own panel was tried and dropped: the user preferred form on the shared chart.
- Lines are drawn as monotone cubic curves (no overshoot), and `LineChart` names its series in the legend, not at the line ends; see [metric-info-tips.md](metric-info-tips.md) for where help text lives.

## Reasons

- Two axes let the scaling decide where lines cross, which suggests relationships that aren't there; separate panels or a switch avoid that.
- Trends points are sessions or days, so comparing two measures at the same instant matters less than on one run, and a switch halves the page height.
- Mocked in a Design canvas first; the user liked the pill switch on the easy-run card and kept the curves as they were.
- The card anatomy was also mocked first (four phone cards, 2026-11-23). A number on top answers "how am I doing now" before the reader has to read the chart; the key numbers replace notes and lists that used to trail under some charts.
