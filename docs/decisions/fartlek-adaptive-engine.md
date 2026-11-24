---
title: Fartlek adapts at week level: Monday check-in, reasons for misses, pause by repeating the week
summary: How the block engine reacts to struck, moved, short and too-hard sessions: evaluate per week not per day, ask why after two misses in a row, a pause repeats the week and shifts the block, a skipped easy run may lift the long run slightly past the 30-day rule
type: decision
status: accepted
updated: 2026-11-24
---

# Fartlek adapts at week level: Monday check-in, reasons for misses, pause by repeating the week

Settled in a chat with the user on 2026-11-14, as the next step of item 3 of the [roadmap](fartlek-roadmap.md) ("suggested changes on events"). The aim: the engine that suggests blocks must be a real selling point, so it has to adapt to what actually happened. It builds on [key sessions first](fartlek-key-sessions-first.md), [Idag](fartlek-today.md) and the [block coach](fartlek-block-coach.md). The first slice is built (see "Built so far"); the rest is design.

## Principle

Fartlek looks at the block as a whole, not day by day (the user's own line from the start). Every deviation goes through three steps:

1. **Absorbed**: small against the block, nothing happens.
2. **Fixed locally** in the week: move, swap or spread (most of this exists on Home).
3. **Re-plan the rest of the block**: the same engine run from today on what was actually done, with the runner's own edited sessions locked, shown as a diff with what-if numbers ("form on race day +12 → +9"), and applied only on accept.

Everything stays inside the existing guards (+10 % a week, the tolerated load, the threshold ladder), apart from the one exception below.

## Monday check-in

Evaluation moves from daily to **weekly**. On Monday Home shows a "Välkommen till en ny vecka" card: how last week went in a line or two, what we suggest for this week instead, what that does to the block, and **Acceptera / Ignorera**. The day-level offers on Idag (move a missed run, fix a key session) stay, but quiet; the card is where the block is re-judged.

## The card (mocked 2026-11-14)

Mocked in the Claude Design canvas **"Fartlek – Måndagscheck-in"**: a normal week, a whole week missed, and after "Ignorera". A card on Home, not a modal: a modal interrupts the first thing the runner opens the app for, is cramped on a phone for reasons and a diff, and a card stays until it is decided, so opening the app on Wednesday still finds it.

- **Position:** on top of Home, above Idag, open by default. A whole missed week gets a coral band on the card, still a card.
- **After Ignorera** it shrinks to one line, "Veckan är ojusterad. Vill du justera?" with a button, so the choice can be changed. No push at first; a small dot on the Home icon at most.
- **Missed week: ask first, recommend after.** The card shows only the question and the reason chips. Picking a reason expands the card with a short transition (reduced motion respected) into the recommendation, the block diff, the effect and Acceptera / Ignorera. More chips can be picked and the recommendation follows them, with a line saying what it is based on ("utifrån sjuk, stressad"):
  - sjuk or ont/skada: pause a week (repeat the week as re-entry, the block grows by a week)
  - stressad or trött: the same week again, lighter (about 80 %), nothing caught up
  - only resa, ingen tid or annat: the week again as planned
  Skada adds "where does it hurt?"; sjuk with stress adds that nothing is caught up. "Justera själv i stället" is always there.
- **The long-run extra km is not explained by default.** The card shows only "16 km → 17 km" and a small "Varför?". It unfolds a box: the skipped run and being rested, the 10 % rule and its study, that up to 15 % after an unexplained miss is Fartlek's own judgement and not the study's, that it is never done after illness, pain or stress, and "Behåll 16 km". The same fact would otherwise crowd the card on every normal Monday.

## Why did you miss it?

The question lives **inside the Monday check-in**, not as a separate prompt on other days. When last week had **two or more missed or struck sessions in a row, up to a whole week missed**, the card asks "Vad fick dig att missa?" first, then whether to adjust the block, and shows what is affected (which weeks move, the peak week, form on race day). Several reasons can be selected at once: sjuk, ont/skada, ingen tid, stressad, resa, trött/ingen motivation, annat. The answer decides the response, because catching up is wrong after illness or stress and right after a simple miss:

| Reason | Response |
|---|---|
| Sjuk, skada, ont (severity decides) | **Pause**: see below. Pain at 8+ keeps its veto; for pain, ask where. |
| Stressad, trött | No catch-up. Lighter or repeated week, form-judged as usual. |
| Resa, ingen tid | A short miss is absorbed; a long one is handled like a pause. |
| Ingen särskild anledning | Catch-up allowed (see below). |

The reasons are stored per miss so Fartlek can later show patterns (always missing Thursdays, stress before races).

## Pause: repeat the week

A pause **extends the block by one week and shifts everything after it**. The result reads: the week where a lot was skipped, the same week again, then the block carries on. The repeated week is built from what was actually done (re-entry logic, `weekCapWith`), not copied. Severity picks the size: a few days out is one repeated week, a week or more is re-entry from the load that is left. With a fixed race date the block cannot grow, so the engine compresses instead and says what gives (a smaller peak week, a shorter taper). *Amended 2026-11-24 by [race plan skeleton](fartlek-race-plan-skeleton.md):* the taper and the race-specific phase are never shortened; a break costs the phase it falls in and km are never made up; 8 days or more off makes the next block's first week at most 70 %.

## Catch-up on the long run, bending the 10 % rule

A skipped easy run with no reason (say a 6 km zone 2 in a 40 km week with a 15 km long run) may lift the next long run by **1–2 km** on top of its normal step, since the runner is more rested when doing it. This is a deliberate, bounded exception to the 30-day rule of [key sessions first](fartlek-key-sessions-first.md):

- Only for an unexplained miss, never after illness, pain or stress.
- At most +1.5 km over the normal step and never more than 15 % over the longest run of 30 days (15 km → 17 km at most, with the normal step 16).
- Shown with its reason in the ⓘ, and the ▲ spike mark does not flag it. It is yellow rather than a warning.

The study behind the rule ([Frandsen et al., BJSM 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/)) is observational and links runs 10–30 % over the longest of 30 days to more overuse injuries (HRR 1.64). The "more rested" argument is the user's reasoning, not the study's, so the exception is kept small and its size is a tuning value, not a hard-coded fact.

## The scenarios

- **Struck session.** Easy: absorbed or spread over the week as today. Threshold: moved if there is room (never hard next to hard), else struck; the rung repeats. Long run: never caught up, the step repeats.
- **Moved session.** First check whether matching within the week already solved it (then nothing is suggested). Otherwise the session **swaps with the easy run on its new day** rather than pushing that run to the first free day, which can give hard-hard or cross a week border. An empty day: do nothing.
- **Too short** (under about 75–80 % of planned). Easy: absorbed until the week is more than about 10 % under, then catch-up later in the week (easy runs at most +30 %, as today), else it is left to next week's build. A key session ended by how the body felt is not caught up.
- **Too hard.** An easy run run too fast is a message ("zon 2-passet låg på tröskelpuls"), not a change to the plan. A really hard session or race goes through the existing dial in this order: the next day easy, the next key session within 48 h one rung down, the week's zone 2 km −10 %, and the long run last, only when form is ≤ 5 and the long run is within two days.
- **Also handled:** an extra session or a big week is absorbed (no cut if form is fine); a "jag är sjuk/skadad" button; known absence (holiday, travel) marked on weeks in advance so the plan is built around it; a B race appearing inside the block adds a taper; a block status line ("på spåret / 6 % efter") so re-planning is offered when needed, not before.

## Built so far (2026-11-15)

- **Monday card on Home** ([`client/weekreview.tsx`](../../apps/fartlek/src/client/weekreview.tsx)), shown Monday to Thursday: reason chips that unfold the recommendation, and the small long-run proposal with "Varför?". "Ignorera" is remembered per week in the browser and leaves the one-line row.
- **Review and rules** in [`shared/weekreview.ts`](../../apps/fartlek/src/shared/weekreview.ts): last week's misses, two in a row asks why, the reasons give pause / lighter / again, and the long-run catch-up (1 km on top, at most 15 % over the longest run of 30 days, only for one unexplained missed easy run of 4 km or more). `GET /home` carries `review`.
- **Catch-up is tagged** `[catch-up]` in the long run's notes; the ▲ spike mark and the Idag long-run fix read the tag and allow 15 % for that run.
- **Reasons** are stored as skip reasons on the missed sessions (`stress` and `time` added to the list).
- **Accepting a missed-week recommendation:** reasons saved, then the re-plan dialog opens with the block a week longer, from today on, lighter for the lighter answer; it shows the diff and what-if before anything is saved (see "One entry to the engine"). `GET /plan/next-week` also accepts the running week.

- **Moving a missed session (2026-11-16).** `movePlan` in [`shared/today.ts`](../../apps/fartlek/src/shared/today.ts): a free day where it fits first; else a key session takes over the day of a later easy run where a hard session fits, and the easy run moves to the first free day after it, or is struck when there is none (an easy run is what the week can spare). A missed easy run never takes over a day. Idag offers it as "Ta lördagens lugnt 6 km" with what happens to the easy run.
- **The too-hard dial (2026-11-16).** `hardSession` + `tooHardPlan`: a session in the last two days at 1.3× its planned load and at least 20 more (or a race) gets the first step that applies, in order: a key session the next day moves (or becomes an easy run), a threshold session on the ladder within two days goes a rung down, the week's easy runs lose 10 %, and only with a form score of 5 or lower and the long run within two days is the long run shortened. "Behåll planen" is remembered per session and step. An easy or long run graded "off" by the app's own easy score is a one-line note on Idag, never a change (the easy score, not the watch's raw zones, so it never disagrees with the grade shown on the run).

- **A pause that can't grow the block is compressed (2026-11-16).** When the next block starts right after, or a race lies in the week the pause would add, `GET /blocks/:id/replan?extend=1` makes the same call without the extra week and with no km goal: the rest is planned again within the weeks that are left, from what was actually run, so the biggest week gets smaller instead. The dialog says which block or race holds the end (`compressed`). A race inside the weeks left still goes to the block editor's race mode, as before.

## One entry to the engine (2026-11-15)

The user's rule: the engine must work for any day, week, month or date range, and every reason to plan is just a call with other input, so it never grows special cases. [`shared/planrange.ts`](../../apps/fartlek/src/shared/planrange.ts) is that entry:

- `planRange(seed, { from, to, goalKm?, light? })` plans the whole weeks that cover the range (`rangeWeeks`) with the block engine and clips the plan to the range. A week is a one-week range, a block a longer one, "re-plan the rest" the range from today (or next Monday) to the block's end, a pause the same range with `extend: 1` (a week more), a lighter week `light`.
- `diffPlans(seed, before, after)` compares a plan with the one it replaces: per week the km and the days added, removed or changed, and for the whole plan km, the biggest week, the form in the deepest build week and where it ends. The re-plan dialog shows it as what-if tiles ("Förut: −20,5") and a changes column, live as the weeks are edited.
- `GET/POST /blocks/:id/replan` takes `extend` (0–2), `thisWeek` (start from the running week, from today on) and `light`. A longer block aims at no goal (as much as is safe) and refuses to grow into the next block. The Monday card's accept is this call with `extend=1`, `thisWeek=1` and `light` for the lighter answer; outside a block it falls back to "Föreslå veckan" for the week.
- A plan never touches a day that is over: replaced sessions and written sessions start today.

**One engine, not two (2026-11-16).** The user asked to make it real: "Föreslå veckan" is now the block engine with one week (`suggestWeek` in [`shared/blockplan.ts`](../../apps/fartlek/src/shared/blockplan.ts)); the week's own search is gone from `nextweek.ts`, which keeps only the rules for building a week. The block is the main feature, so where the two differed the block's rule won. The runner's own weekly target became input (`fixedKm`, a week built at that size and never fitted), a lighter week due became a lighter first week, and the block's start cap is the same engine run for that week alone instead of a call into a second engine. Checked against the planning scenarios before and after: every block came out identical; the only change is the week button for a steady runner, 33 → 31.5 km, because a lone build week sits in the middle of the block's ramp (+5 % on the tolerated load) where the old week went to the +10 % cap. A tired runner's week is now never cut to key sessions only, as in the block. The user: one or two weaker weeks are fine if the long run is consistent; if the block suffers, revisit.

**Every call through the entry (2026-11-16).** "Föreslå veckan" (`GET /plan/next-week`), "Föreslå block" (`GET /plan/block-suggest`) and the re-plan (`GET /blocks/:id/replan`) all ask `planRange` for a range: the week from today in the running week, the block's weeks, the rest of a block. The week dialog gets the one-week plan in its own shape (`asWeekSuggestion`). The planning scenarios came out unchanged.

## Passed over

- Day-by-day corrections: against the philosophy of the app and the [Idag](fartlek-today.md) principle that the score warns, it doesn't steer.
- Catching up after every miss: wrong after illness and stress, and it would crowd weeks.
- Changing the plan without an accept, as Runna does: kept as a what-if the runner accepts or ignores, as everywhere else ([never lock anything in](fartlek-suggest-week.md)).

## Open

- Whether the reasons feed the form score (stress as a signal), or only the plan.
- The size of the long-run exception (+1.5 km / 15 %) once it has been tried on real blocks; first as a developer setting like the other tuning values ([block progression](fartlek-block-progression.md)).
- Whether the Monday check-in replaces the Home offers on Idag or sits beside them.
- A dot on the Home icon while a check-in waits, or nothing at all.
- A whole week missed with no answer given: treated as a pause suggestion, never applied without accept.
- Build order: the block-level re-plan with diff and what-if first, then the miss reasons and pause, then the Monday card.
