---
title: Fartlek's plan calendar is one calmer view, with no separate read mode
summary: Vecka and Månad keep one view; the week header becomes a slim left column, week actions move behind ⋯, sessions keep their type colour when done (dot and ✓ as a bullet column), linked runs merge into the session and activity types get Swedish names; includes the build plan
type: decision
status: accepted
updated: 2026-11-27
---

# Fartlek's plan calendar is one calmer view, with no separate read mode

Settled with the user on 2026-11-27 from design mocks (variants A, B and C on a design canvas). The [build plan](#build-plan) is written so a small model can follow it step by step.

## Decided

- **One view, no read mode.** A separate "Översikt" (read-only, counting weeks to the race) was mocked and dropped: with week numbers instead of "weeks out" it was the same calendar with bigger type, and two modes add a choice the runner has to make. The periods stay Vecka / Månad / Block. The Block view already shows the whole block week by week.
- **The week header becomes a slim left column** (desktop) or a strip above the days (phone): week, dates, km done / target with a bar, block, status. The bar is always the lavender chart colour; reaching the target adds a green ✓ after the number instead of turning the bar green, so green keeps meaning "easy" or "done".
- **Week actions go behind ⋯** per week: Föreslå veckan (when allowed, as today), Mål, Kopiera.
- **Badges become text.** Status ("I fas", "Pågår"…) and backoff ("avlastning") are muted text in the column; "Lite efter" and "Över planen" use the warning colour. The easy share (Z1–2) only shows when it is under `EASY_SHARE_FLAG`, as a warning. "nyckelpass x/y" goes: the dots show the key sessions.
- **Sessions keep their type colour when done.** Each session is a two-row bullet: the type dot before the title, and before the detail line a green ✓ (done) or amber ✓ (short); nothing for planned or to do. No border, no box, no outcome badges.
- **The detail line carries the rest**: "kort", missed or skipped with its reason, the linked run's distance (or type and time), "2 av 3 drag i mål", otherwise the step summary. A linked activity is no longer listed again under the day; only unlinked extras are, as a muted "+" line.
- **Activity types get names** in both languages (Simning, Promenad, Styrka…) instead of Garmin's type keys ("lap swimming"); unknown keys fall back to the key with spaces.
- **The drag hint shows once** and is dismissed for good (per browser).

Passed over: a colour-filled cell per session as in the read mock (breaks when a day has two sessions or plan and outcome both show), and the dot in the card's corner (looked messy).

## Build plan

Files: `apps/fartlek/src/client/bits.tsx`, `apps/fartlek/src/client/i18n/activity.ts`, `apps/fartlek/src/client/pages/Activities.tsx` (part 1) and `apps/fartlek/src/client/pages/Plan.tsx`, `apps/fartlek/src/client/i18n/plan.ts` (part 2). No server or shared change. Every new string goes in both `en` and `sv`.

### Part 1: activity type names

1. In `i18n/activity.ts` add keys `acttype.<garmin key>` to `en` and `sv`: running Löpning, trail_running Terränglöpning, treadmill_running Löpband, walking Promenad, hiking Vandring, cycling Cykling, road_biking Landsvägscykling, indoor_cycling Inomhuscykling, mountain_biking Mountainbike, lap_swimming Simning, open_water_swimming Simning i öppet vatten, strength_training Styrka, yoga Yoga, pilates Pilates, racket_sports Racketsport, tennis Tennis, padel Padel, elliptical Crosstrainer, indoor_rowing Roddmaskin, cross_country_skiing Längdskidor, other Annat.
2. In `bits.tsx` export `activityTypeName(typeKey: string): string`: look up `acttype.${typeKey}` with `t` (cast to `MsgKey`); if the result equals the key (missing), return `typeKey.replace(/_/g, " ")`.
3. Use it wherever a type key is shown: `pages/Activities.tsx` (two places) and the activity `<option>` in `Plan.tsx`'s `WorkoutDialog` (part 2 does that one).

### Part 2: the calendar (`pages/Plan.tsx`)

1. **Drag hint once.** Replace `<p … plan.dragHint>` with a small component: read `localStorage["fartlek.plan.dragHintSeen"]` in a try/catch; when not `"1"`, show the hint (desktop only, as today) with a ghost button `t("common.done")` that sets the key to `"1"` (in a try/catch) and hides it.
2. **Weekday header row** gets the column offset: `md:grid-cols-[10rem_repeat(7,minmax(0,1fr))]` with an empty first cell.
3. **`WeekRow` layout.** The `Card` drops the block `borderLeft` style. Inside: `<div className="md:grid md:grid-cols-[10rem_minmax(0,1fr)]">`, then the column, then the existing day grid (`grid md:grid-cols-7`). The column: `flex flex-col gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground md:border-b-0 md:border-r`. On phones it reads as a strip above the days.
4. **Column content, top to bottom:**
   - A row with `t("plan.weekOf", { week })` (font-medium, foreground) and the date range, plus a `MoreMenu` (`className="h-6 w-6"`, `label={t("plan.weekMenu")}`) with items: `t("next.button")` → `onSuggest` only when `canSuggest`; `t("plan.target")` → `onTarget`; `t("common.copy")` → `onCopy`. Add `plan.weekMenu`: en "Week actions", sv "Veckans val".
   - Km: `<b>` actual (foreground, tabular-nums), then ` / target` when `week.targetKm`, then the unit, then a green check SVG (`text-success`, `role="img"`, `aria-label={t("plan.targetMet")}`) when `week.targetKm && week.actualKm >= week.targetKm`. Add `plan.targetMet`: en "Week target reached", sv "Veckomålet nått".
   - When `week.targetKm`: a bar `h-1 rounded-full bg-muted` with an inner `bg-chart-1` of width `min(100, actual / target × 100)%`.
   - When there is no target but `data.skeleton?.[week.weekStart]`: the existing `road.weekTarget` text, muted, no dashed pill.
   - Block: a `size-[7px] rounded-full` dot in `BLOCK_COLOR[block.kind]` and `blockName(block)`; with no block and `data.blocks.length > 0`, `t("plan.noBlock")` without a dot. Append ` · ${t("plan.backoff")}` when `week.backoff`.
   - Status: `t(\`status.${week.status}\`)`, with `text-warning` for `behind` and `overreaching`.
   - Easy share: only when `week.easyShare != null && week.easyShare < EASY_SHARE_FLAG`, the existing `plan.easyShare` text in `text-warning`.
   - Remove `StatusBadge`, the `Badge`s, `plan.key` and the inline Föreslå / Mål / Kopiera buttons from the week. Drop now-unused imports.
5. **Day cells.** Remove `md:border-r` between days. Keep the today background, the out-of-month background, the date and the hover "+".
6. **`SessionChip`** becomes a bullet (keep `draggable`, `onDragStart`, `onClick`, `data-tour`):
   - Button classes: `-mx-1.5 grid w-full cursor-grab grid-cols-[0.75rem_minmax(0,1fr)] items-center gap-x-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-accent active:cursor-grabbing`. No border, no background, no `borderLeft`.
   - Row 1: a `size-[7px] justify-self-center rounded-full` dot with `style={{ background: TYPE_COLOR[s.workout.type] }}`; the title (`truncate font-medium`, spike ▲ as today, `workoutText`). Title gets `text-muted-foreground line-through` when the outcome is `dropped`, `skipped` or `missed`.
   - Row 2, only when there is a check or detail text: first cell a check SVG (`size-3 justify-self-center`), `text-success` for `done`, `text-warning` for `short`, otherwise an empty `<span />`; second cell the detail line (`truncate text-muted-foreground`).
   - Detail line = these parts joined with " · ", skipping empty ones: `t("outcome.short")` when short; `t(\`outcome.${o}\`)` plus `skipReason(...)` for missed / skipped / dropped; the linked activity as `fmt.dist(km)` for a run or `activityTypeName(typeKey)` otherwise, plus `fmtDuration(durationS)` when not `compact`; `t("pva.summary", …)` when `stepSummary.workJudged > 0`; the steps summary when there is no linked activity; `workout.notes` when not `compact` and nothing else.
   - Remove `OutcomeBadge` and the pva pill from the chip.
   - The check SVG: `viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"`, path `M5 12.5l4.5 4.5L19 7.5`, `aria-hidden` (the outcome is in the detail text or in the button's `aria-label`). Give the button `aria-label` = title + outcome text (`t(\`outcome.${s.outcome}\`)`) for screen readers.
7. **Extras.** In the day's activity list, render only activities that are not linked to a session: `+ {a.isRun ? fmt.dist(km) : activityTypeName(a.typeKey)}` plus ` · duration` when not `compact`, classes `block truncate rounded pl-[1.125rem] text-xs text-muted-foreground hover:bg-accent`, still a `Link` to the activity.
8. **WorkoutDialog** `<option>` uses `activityTypeName(a.typeKey)`.

### Check

`npm run check` passes. Look at the plan page with demo data in Vecka and Månad, on desktop and at phone width.
