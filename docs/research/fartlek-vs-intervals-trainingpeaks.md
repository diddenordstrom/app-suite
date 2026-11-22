---
title: Fartlek vs intervals.icu and TrainingPeaks (research)
summary: Where Fartlek stands against intervals.icu and TrainingPeaks (Nov 2026), whether to keep building it, and what that means for the roadmap
type: research
updated: 2026-11-12
---

> Asked in a chat (Nov 2026): is Fartlek worth building further, or is it better to drop it and use intervals.icu? The worry was the feedback "it's worse than open-source intervals.icu, use that instead". Based on the code and docs in this repo plus pricing pages, forum threads and reviews; the competitors' UIs were not tried hands-on. Related: [structured workouts and planned vs actual](../decisions/fartlek-structured-workouts.md).

## 1. Correction: intervals.icu is not open source

intervals.icu is **free but closed source**. Its developer (David Tinker) wrote in the forum in December 2023 that outside contributions aren't possible because the code is closed, citing data privacy; extension happens through the API and server-side JavaScript charts and fields. It is run by Intervals.icu Ltd (London) and funded by a $4/month "Supporter" plan (MCP connector, annual plan builder, fully custom zones, full Strava history) on top of a free tier with no time limit.

So if app-suite is opened, Fartlek would be the open-source, self-hosted one of the three.

## 2. The competitors (Nov 2026)

**TrainingPeaks**
- Owned by **Garmin since 22 July 2026** (bought with TrainHeroic from Peaksware).
- Premium about $135/year or $19.95/month; the free tier mostly logs and follows a plan.
- Strengths: clean, simple UI; coach ecosystem and plan marketplace; official push of workouts to the watch; mobile app; many device brands.
- Criticism: thin analysis (deep analysis is WKO, sold separately), development seen as stuck in the 2010s, no AI coaching, and open questions about support for non-Garmin devices after the acquisition.

**intervals.icu**
- Free, very broad, analysis-first, multi-sport: workout builder with a text syntax, push of structured workouts to Garmin, plans and a library, threshold estimates, fitness/fatigue/form, custom charts in JS.
- Criticism: the UI is called messy (pop-ups, clutter) and setup takes tinkering; steep learning curve; no native app (responsive web).
- Started cycling-first. Running has improved, but pushing running workouts has had rough edges: pace targets dropped when the run threshold pace isn't set, and mixing HR and pace targets in one workout didn't work until a later fix.

## 3. Side by side

| | Fartlek | intervals.icu | TrainingPeaks |
|---|---|---|---|
| Price | Free, self-hosted | Free / $4 | ~$135/year |
| Focus | Self-coached runner | Everything, analysis first | Coach + athlete, multi-sport |
| Language | Swedish/English | English | English |
| Data sources | Garmin only (pull, Personal API) | Garmin, Strava, Wahoo and more | Nearly all |
| Structured workouts | Designed, not built | Yes | Yes |
| Push to watch | No | Yes | Yes |
| Analysis depth | Medium, curated | Very deep | Medium |
| Interpretation ("what does it mean?") | **Strongest**: form score as a list of deductions, ⓘ tips with the app's own thresholds, on track with reasons | Weak, numbers without explanation | New "Performance Insights", shallow |
| Plan that survives real life | **Yes**: flexible matching, one missed session never makes a week behind | Green/red per session | Green/red per session |
| Running-specific | **Pain log, carbs and gut training, durability, critical speed, cadence coming** | Generic | Generic |

## 4. Where Fartlek loses, and will keep losing

- **Breadth and depth of analysis.** intervals.icu has years of head start and a full-time developer. Curves, custom charts, power analysis and multi-sport would make Fartlek a worse copy; this is exactly where "it's worse than intervals" lands.
- **Watch integration.** Pushing workouts needs a real Garmin workout integration; Fartlek only has the Personal API (pull), and Garmin now owns TrainingPeaks.
- **Garmin only.** A Coros or Polar user can't use it.
- **Bus factor of one.** Fine for a side project, but an honest argument others will raise.

## 5. Conclusion: keep building, stop chasing parity

1. It is used and liked by its first users, which is the validation that matters for a side project. Using intervals.icu alongside costs nothing.
2. There is a niche neither competitor fills: a **coach for self-coached runners** that explains and prioritises, in Swedish, and doesn't punish a plan that moved. intervals.icu's strength is being neutral and flexible, so it is unlikely to become that.
3. The portfolio value is the judgement, not the feature list: "an app that says what your data means and why" beats "a worse TrainingPeaks".

The one-line answer to "it's worse than intervals.icu": *for analysis, yes. Fartlek isn't an analysis tool, it's a coach. intervals shows you the HRV curve; Fartlek tells you whether to do today's threshold session.*

## 6. Roadmap implications (recommendations, not decided)

> Partly overtaken on 2026-11-12: curves and a multi-sport data foundation are now in, see [the Fartlek roadmap](../decisions/fartlek-roadmap.md).

**Keep going with**
- Structured workouts and per-step planned vs actual ([decision](../decisions/fartlek-structured-workouts.md)). The judging ("3 of 3 reps on target, HR drifted 6 beats on the last") is interpretation, which fits the niche.
- Cadence as a trend at a given pace rather than a 180 line (already proposed there).
- A plain-language weekly summary ("good week, a bit little easy running, the long run held together"): the most Fartlek-like feature still missing.
- The changelog, now that other people use the app.

**Deprioritise or skip**
- The single combined graph with all data, the map, custom charts, curves and multi-sport: intervals.icu and TrainingPeaks territory. An elevation profile and the lap table explain a session well enough.
- Push to watch, until there is a Garmin route for it.

## 7. Open

- **intervals.icu as an optional data source.** It has a public API. Reading activities and wellness from it would give Coros, Polar, Suunto and Wahoo support without new integrations, turning intervals.icu from competitor into supplier. Check its API terms first.
- **Side-by-side test.** Connect Garmin to intervals.icu (free) and run both for 2–3 weeks, noting each time intervals answered something Fartlek couldn't. That list is the real roadmap; what never comes up can be ignored.

## Sources

- [intervals.icu – Pricing](https://www.intervals.icu/pricing)
- [intervals.icu forum – Code contribution via git (closed source)](https://forum.intervals.icu/t/code-contribution-via-git/31938)
- [intervals.icu forum – Structured running workouts to Garmin Connect](https://forum.intervals.icu/t/structured-running-workouts-from-intervals-to-garmin-connect/130705)
- [Slowtwitch – Intervals.icu vs TrainingPeaks premium](https://forum.slowtwitch.com/t/intervals-icu-vs-trainingpeaks-premium/1281656)
- [TrainingPeaks review 2026 (aitoolsbakery)](https://aitoolsbakery.com/blog/trainingpeaks-review/)
- [Peaksware – Garmin acquires TrainingPeaks and TrainHeroic](https://peaksware.com/garmin-acquires-trainingpeaks-and-trainheroic-leading-endurance-and-strength-training-platforms-for-athletes-and-coaches/)
- [Tredict – Garmin acquires TrainingPeaks](https://www.tredict.com/blog/garmin_acquires_trainingpeaks/)
- [TrainingPeaks – Pricing](https://www.trainingpeaks.com/blog/trainingpeaks-pricing/)
