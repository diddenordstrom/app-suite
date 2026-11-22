---
title: Fartlek compares the same session over time
summary: Runs of a structured session are grouped by the fingerprint of their quality work (reps × length × target kind, rest ignored) and compared on GAP pace, HR and efficiency, on the activity page and on Trends, from the third run on
type: decision
status: accepted
updated: 2026-11-13
---

# Fartlek compares the same session over time

Mocked on 2026-11-13 in the Claude Design canvas **"Fartlek – samma pass över tid"**: a card on the activity page, a Trends card and the phone version. The user found it worth building for a data-nerd app: running the same threshold session week after week is the clearest sign of progress ("lower HR at the same pace, or faster at the same HR").

## Decided

- **No link to templates.** The [session library](fartlek-session-builder.md) had said workouts must remember their template before sessions can be compared over time. Instead, a session's **fingerprint** comes from its steps (`signature` in [`shared/samesession.ts`](../../apps/fartlek/src/shared/samesession.ts)), so it works backwards on every structured session, whether it came from a template, the engine, the block text or was typed.
- **What counts as the same:** as many reps, each as long, at the same kind of target (`3x480s@thr`). The user: "minut per drag ja, skit i vila". Rest, warm-up, cool-down, easy running and strides are left out. Quality work is threshold, % of threshold, pace, HR or zone 3 and up. 3×8 and 4×6 are different outlines.
- **Numbers per run** over the quality reps only, from the step match the activity page already makes: **GAP pace** (from the stored stream's speed and altitude, grade over ±25 m, the same grade factor as step detection; raw pace without altitude), **HR** (each rep without its first 90 s, as the step match does) and **efficiency** = GAP speed / HR, shown as metres per heartbeat and as % since the first run. A run counts when at least half its reps were matched to laps.
- **From the third run on** (`SAME.minTimes`). Before that the card says how many runs are left.
- **Context, no verdicts:** form (TSB) that day and the run's elevation gain sit beside the numbers. Faster or lower HR is green, slower is muted, never red: one slow day is not a judgement. Fartlek has no weather data, so temperature is left out.
- **Where:** the activity page under "Plan mot utfört", with GAP, HR and efficiency, a chart and rep by rep against last time; Trends gets a card with an outline picker and Tempo & puls / Effektivitet.
- **Pace and HR in one chart** (as in the mock, the user's choice after first seeing one chart at a time): GAP on the left axis and HR on the right, both turned so up is better, x by real date; hovering a run shows its pace, HR, form and elevation gain. Fartlek's own chart, since the shared line chart has one axis.
- The last year is searched, at most 20 runs per outline are shown.
