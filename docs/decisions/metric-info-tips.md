---
title: Metric explanations live in ⓘ tips, not in the tours
summary: Values like CTL/ATL/TSB get a short ⓘ explanation next to them; tours only point to the ⓘ; no separate glossary page
type: decision
status: accepted
updated: 2026-11-14
---

# Metric explanations live in ⓘ tips, not in the tours

## Decision

- A metric that needs explaining gets an ⓘ after its label (`InfoTip` in [packages/ui](../../packages/ui/src/InfoTip.tsx), or `info` on `Stat`): one or two sentences, opened by hover with a mouse and by tap or keyboard, closed with Esc or a tap outside.
- The spotlight tours stay short and say *where* the help is ("tap ⓘ next to a value"), not what every value means.
- No separate glossary page for now.
- Any number in an explanation comes from the same constants the app calculates with, never written into the text. Fartlek's form bands are `FORM` in [shared/load.ts](../../apps/fartlek/src/shared/load.ts) (rested above +5, building −10 to −25, heavy below −25), used by both `formState` and the Form tip.
- First use: Fitness, Fatigue and Form on Fartlek's Home load card.
- Every chart on Fartlek's Trends page has an ⓘ after its title saying how to read it: what the line is and what good looks like (up, down, a band). Km per week and the last five pain levels are left without one, since they read themselves.

- **One home for each sentence (2026-11-14).** The ⓘ carries everything static about a chart: what the lines are, how to read the axis, what good looks like, definitions, rules of thumb and caveats. The text under a chart only holds what is computed from the user's data (the plan forecast, the fuel advice and list, a note that only some runs had GAP) or an action (the link to set an easy band). If a sentence under a chart would read the same for every user, it belongs in the ⓘ. Reason: both used to say nearly the same thing and the Trends page was a wall of small print.

## Reasons

- Tours are seen once and get skipped when long; the question "what does −4 mean?" comes back later, at the value.
- A long glossary page is rarely read; the explanation is most useful where the number is.
- The common rule of thumb for form is −10 to −30, but the tip has to say the same as the "building"/"heavy" label under the value, so it follows the app's own −25.

## Tour length and order (2026-11-11)

The user found the tours too long and jumpy (Trends went from the top two cards to one near the bottom, then back up). Every tour now has **3–4 steps, in page order** (top to bottom). Steps that only explain a value are left to its ⓘ; setup steps (the Garmin key) stay because they are actions. Onboarding: welcome, Dagsform, the week, Plan; without Garmin, welcome, Dagsform, then Settings → key → sync. Trends: kilometres, load, threshold, intensity; critical speed and HRV are dropped.

The spotlight is drawn only once the page has stopped scrolling to the element: the ring used to animate behind the scroll and sat outside the element for about a second.
