---
title: Fartlek roadmap: progress graphs for data nerds, today first
summary: Who Fartlek is for (self-coached, data-loving marathon runners), what it won't try to be, and the build order from late 2026 to the 2028 triathlon
type: decision
status: accepted
updated: 2026-11-20
---

# Fartlek roadmap: progress graphs for data nerds, today first

Settled in a chat on 2026-11-12, after comparing Fartlek with TrainingPeaks and Runna. It builds on [Fartlek vs intervals.icu and TrainingPeaks](../research/fartlek-vs-intervals-trainingpeaks.md) and changes one of its recommendations (see "What changed" below). Loose where the chat was loose: the order is firm, the details of each item are not.

## Who it is for

- **Data nerds who love seeing progress in graphs and digging into optimal training.** Not a Runna clone that tells you what to do: Fartlek shows, explains and suggests, and the runner decides ([never lock anything in](fartlek-suggest-week.md)).
- The sharpest niche is the **self-coached marathon runner**: second or third marathon, knows the basics, wants to plan their own blocks and understand why.
- What is actually unique: explainable numbers (Dagsform as a list of deductions, ⓘ tips with the app's own thresholds), planning your own blocks in text with a coach beside it, Swedish with week numbers, and open/self-hostable.

## Business: not now

- As a paid product it is thin against Runna (Strava), Garmin's free adaptive plans, free intervals.icu and TrainingPeaks (Garmin). Charging would also mean a company, VAT, payments, support, health-data GDPR and hosting that isn't a home server.
- **Garmin is the bottleneck.** Sync uses Garmin's *personal* API with each user's own key. Read its terms before ever charging; a commercial service normally needs Garmin's Connect Developer Program (application and approval).
- Leaning towards **open source first**, then seeing whether people ask for a hosted version. That would be the moment to revisit money (the paused coffee button first). The demo mode and the Komodo setup are already half of a hosted offer.

## What we won't build

- Week suggestions for triathlon (balancing three sports and bricks is months of work; plan those weeks by hand).
- Push to watch through Garmin's partner API (a `.FIT` workout export is the cheap stand-in, if wanted).
- Coach/athlete sharing and social feeds.
- A daily "here's what to do" nag.

## Build order

Trends already has threshold pace, threshold HR, easy pace in an HR band (pace at a fixed effort), durability (efficiency drop on long runs), critical speed, intensity distribution, HRV and resting HR. So "pace over time" is mostly there; what's missing is the curve of best efforts, a prediction, and ways to compare sessions.

1. **"Idag" first on Home** (built, see [Idag](fartlek-today.md)). A card at the top that says what's on today ("9 tröskel 3x8"), today's Dagsform with its verdict, and what the two mean together ("8/10 – kör som planerat"). It extends the [Home redesign](fartlek-readiness.md) ("Dagsform först") rather than adding a card beside it, and it is where item 3 shows up. Cheap and opened every day.
2. **Best efforts → curve → prediction** (built, see [best efforts](fartlek-best-efforts.md)). One data foundation, three uses:
   - Extract best efforts per duration (1, 3, 5, 10, 20, 60 min) and distance from each run's stream.
   - **Best-effort curve**: this block over the previous one, and all-time bests. The running equivalent of a cycling power curve.
   - **Critical speed fitted from those efforts automatically**, so it no longer needs a dedicated test (today it is "estimated from tests").
   - **Predicted race time over time** for the next race, with the goal time as a line.
   - **Garmin's own prediction as a comparison line, if it's reachable.** The community clients read it from `metrics-service/metrics/racepredictions` (latest and daily, keyed by display name); untested with the personal API key, so try that one call before building anything. Treat it as a second opinion, not the answer.
3. **Suggested changes on events, not daily** (missed run and low form on a key session built without what-if numbers, see [Idag](fartlek-today.md)). Triggered by a missed session, Dagsform ≤ 5, or a session far over plan. Framed as a what-if with numbers rather than an order: "Skip Thursday's threshold → race-day form +8 instead of +12", with one or two alternatives (move it, shorten the long run). Built on the existing projection from the [block coach](fartlek-block-coach.md) and [suggest a week](fartlek-suggest-week.md); nothing changes until the runner accepts. Designed in detail (Monday check-in, miss reasons, pause by repeating the week) in [adaptive engine](fartlek-adaptive-engine.md).
4. **More graphs to dig into:**
   - **Zoom into a segment** of an activity's curves with stats for the selection (time, distance, pace, HR, HR drift, cadence, elevation gain). Cheap version first: tap a step band to zoom there; drag-select on desktop only, because on phones dragging fights scrolling and the crosshair. Streams in the curves are ~5 s samples, enough for averages, coarse for strides.
   - **Same session side by side**: the last five "3x8 tröskel" with pace, HR and drift per rep.
   - **Cadence at a given pace** over time (already proposed in [structured workouts](fartlek-structured-workouts.md)).
   - **Marathon pace in long runs**: how many km of each long run were at goal marathon pace, over the block.
5. **Multi-sport foundation, during 2027** (ahead of a half or full Ironman in 2028), so there is a year of per-sport data when the push starts:
   - Today other sports count as hrTSS against the *running* threshold HR, which is wrong (bike HR runs lower, swim HR is its own thing).
   - Thresholds per sport (FTP, swim CSS, run threshold), power-based TSS for the bike and sTSS for the swim, fitness per sport plus total, zones per sport. Roughly 1–2 weeks of evenings.
   - Then: a bike power curve (same code as item 2), sport per session in the block text, race mode with three sports.

## Next (added 2026-11-20)

After comparing with Runna again (Fartlek should be an alternative to it, the only other pure running app):

- **Mål till plan** first: a goal (race, date, goal or recent time, run days) to a plan in two minutes, working before Garmin history. Planned in [mål till plan](fartlek-goal-to-plan.md).
- **Later: the morning notification at scale.** It syncs Garmin for one user at a time; with a few hundred users at the default 08:00 the last one would wait close to an hour. Parallel syncs with a cap and a small spread around the time, before an open instance has that many users ([morning notification](fartlek-morning-push.md)).
- Garmin's Connect Developer Program (Health API for sync, Training API for workouts to the watch) is what an open hosted instance needs; personal API keys don't scale past friends.

## What changed

The research page recommended skipping curves and multi-sport as intervals.icu territory and framed Fartlek as "a coach, not an analysis tool". This page narrows that: Fartlek *is* for people who love analysis, but each graph comes with Fartlek's interpretation on top, and multi-sport is only the data foundation, not plan generation. Separate graphs are still preferred over one overloaded graph ([structured workouts](fartlek-structured-workouts.md)).

## Open

- Does Garmin's race prediction answer with a personal API key? Built to work either way; see [best efforts](fartlek-best-efforts.md).
- Whether a `.FIT` workout export is worth it before the multi-sport work.
