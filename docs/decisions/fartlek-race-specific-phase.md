---
title: Fartlek gets a race-specific phase for the marathon and half, built from blueprints that scale per runner
summary: The last 8 weeks before an A-race marathon or half replace generic quality with race-pace sessions from a catalogue of blueprints in the repo, scaled to the runner; MP comes from today's prediction and is locked for the phase; the last build weeks may aim deep in the existing form band; real injury stops progression; no guard is loosened
type: decision
status: accepted
updated: 2026-11-24
---

# Fartlek gets a race-specific phase for the marathon and half, built from blueprints that scale per runner

Settled with the user on 2026-11-24. Not built yet. It amends "no branches per distance" in [goal to plan](fartlek-goal-to-plan.md): the method stays one engine, but the last weeks before a long race now get race-pace sessions, because those sessions are what every marathon method has in common ([research](../research/marathon-specific-phase.md)). It answers the open pre-race phase in [block progression](fartlek-block-progression.md) and the distance-specific blocks left open in [race blocks](fartlek-race-blocks.md).

## Decided

- **When:** only before an **A race** of **marathon or half marathon**. A B race keeps today's handling. Other distances keep the generic engine.
- **Length:** the weeks inside **8 weeks of the race**. With today's `raceChunks` that is a 3:1 block followed by the form peak 2:2. A race added closer shortens the phase and keeps the block rhythm (7 weeks → 2:1 + 2:2). There was no peer-reviewed optimum to follow; coaches say 6–10 weeks, and 8 fits the 4-week blocks. The taper stays as built (two weeks, depth searched against race-day form), which matches Bosquet's two weeks at −41–60 % volume.
- **Race-specific first:** in the phase, the specific sessions take priority over everything else. Under about 60 km a week the threshold session is **replaced** by an MP/HMP session, so there are still two quality sessions a week (one of them the long run). At higher volume a threshold session may stay as a third.
- **Blueprints, not fixed sessions:** each key session is a blueprint in a file in the repo (not the admin panel), written in the existing step syntax with sizes as shares and progressions, plus what it requires (weekly km, long-run tolerance). The engine scales it to the runner's week, long run, pace and step in the phase. The file is versioned, diffed and tested like code.
- **First catalogue.** Marathon: long run with MP segments, progressive long run, long run with a fast finish, alternations (for example 3 km HMP / 3 km Z2), MP tempo, and a dress rehearsal (8–10 km at MP about 10 days out). Half: HMP repeats, HMP alternations, progressive long run, long run with a fast finish. Tune-up races are not generated; the runner adds them as B races.
- **Progression follows what was done, not the calendar.** A missed key session means next week takes the same step again; two key sessions are never stacked to catch up. Within 3 weeks of the race no long run is moved; a missed one is dropped. A phase that ends early just lands lower in the progression.
- **Long runs:** the ceiling stays at 32 km or 180 min, whichever comes first (`NEXT.longCeiling`), and the spike rule (10 % over the longest run in 30 days) stays. The phase plans one or two runs of 30–32 km, the last 3–5 weeks out, where the runner's tolerance allows. Fokkema 2020: a longest run under 25 km went with slower finishes, over 35 km brought nothing extra, and longer runs did not go with more injuries. Over a year the runner should pass 30–32 km a few times; that comes from normal building, not from the phase.
- **Never a refusal.** The engine always plans the phase, scaled to what the runner can do, and warns when the week is under about 40 km or the long run never reaches 25 km ("this goes with a slower finish").
- **Marathon pace from today's form, not the goal.** MP (and HMP) come from the race prediction (`predictRace`), which carries the least injury risk; Runna does the same and takes no goal time at all. MP is capped at 94 % of critical speed (Smyth & Muniz-Pumares 2020: going out above it predicted the biggest second-half slowdown). When goal and prediction differ by more than 3 %, the engine **always asks** which to train for; it never switches by itself.
- **MP is locked when the phase starts.** Little fitness is built in 8 weeks, and a target that moves every week makes each MP session a moving goal. It is recalculated only after a B race inside the phase, and then the engine asks first.
- **The last build weeks may aim deep, inside the existing band.** In the two build weeks before the taper the engine aims at the deep end of the form band (−20 to −30 %) instead of only staying above the floor, so the taper has more to bring back. No guard changes: the floor, ramp caps, ACWR and spike rule stay. Aubry 2014 is why it stops there: acute fatigue without a drop in performance gave the biggest taper gain, while real overreaching blunted it. The engine backs off when the runner reports pain or misses the paces of the key sessions.
- **Real injury, not daily form, stops the block.** Pain at level 8 or more, or level 5 or more several times in 7 days (the `READINESS.pain` limits Idag already uses), stops the phase's progression and offers a re-plan, which the runner chooses. A bad day never re-plans the block: daily form is for the day, not the month.

## Passed over

- **Admin-authored templates in the database.** One admin who deploys anyway gains little from an editing UI, and the blueprint language is needed either way.
- **Fixed sessions** ("15 km easy + 15 km MP"). They fit one runner; a blueprint is sized per runner.
- **Training at goal pace when it is faster than the prediction**, and switching to a faster prediction silently. An optimistic marathon prediction (about 7.7 % error) would put eight weeks of MP sessions too fast.
- **MP as a fixed share of threshold** (today's 88 % in the builder template) or "99 % of CS then 94 %". Recreational runners race at 79–93 % of CS depending on level, so the prediction is the better source and 94 % is only the cap.
- **3–4 runs over 32 km inside the phase.** At 50 km a week a 32 km run is two thirds of the week; the methods that do it (Pfitzinger) run 90+ km.
- **A peak mode that lifts the guards**, as already passed over in [race blocks](fartlek-race-blocks.md).

## Open

- The blueprint format (shares, steps, requirements) and its exact progressions are first guesses to tune on real histories (`npm run scenarios -w apps/fartlek`).
- How "missed the paces of a key session" is measured (laps against the target from [stream steps](fartlek-stream-steps.md)).
- The block and week planners do not read pain today; the injury stop needs that.
