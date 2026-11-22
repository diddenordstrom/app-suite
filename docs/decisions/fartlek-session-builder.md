---
title: Fartlek session builder, strides and own templates
summary: Sessions are built row by row in one shared builder (workout dialog, week and block suggestions, block editor); strides as a step target and `+ strides` in block text; the week engine puts strides on two easy runs; own templates saved from the builder
type: decision
status: accepted
updated: 2026-11-13
---

# Fartlek session builder, strides and own templates

Mocked on 2026-11-13 in the Claude Design canvas **"Fartlek – bygg pass"**. Two directions were drawn: **A, row by row** (a short list, each row amount, unit and intensity, repeats as their own group) and **B, a timeline** where blocks are dragged out (width = time, height = intensity). The user chose A ("clean AF"); B needs drag and drop, touch and keyboard handling for little gain, and its inspector is A's row anyway.

## The builder

- One component, [`sessionbuilder.tsx`](../../apps/fartlek/src/client/sessionbuilder.tsx), used in all three places so they stay aligned:
  - **Plan › week view**: the workout dialog (type chips, day, then the builder; distance and time fields only when there are no steps).
  - **Suggest week / suggest block**: a "Steg ›" link on each run day opens the builder beside the week, so numbers and charts follow live.
  - **Block editor**: "+ Bygg pass…" next to the quick-add chips writes a block-text part back; in the list view a session chip opens the builder for that part.
- **The step text stays the source of truth.** Every row edit is written back with `stepsText` and parsed again, so the text view ("Visa som text"), the block text and the server read the same grammar ([structured workouts](fartlek-structured-workouts.md)). Edits are plain functions in [`shared/stepedit.ts`](../../apps/fartlek/src/shared/stepedit.ts).
- Roles (warm-up, run, rep, cool-down) are derived as before, not picked.
- A profile bar (width by time, height by planned intensity) and totals: distance, time, load and **quality** (minutes at threshold or harder, strides left out).
- Phones: rows fold to a one-line summary and one row opens at a time (the dialog is already a bottom sheet).
- Built-in templates: Tröskel 3×8, Lugnt + strides, Progressivt, Långpass med MP (MP as 88 % of threshold speed, with a note to change it to your own pace), Tomt pass.

## Strides

- **A step target, `strides`** (`stegringar` is read too), never judged: 20 s is too short for GPS pace or HR. In a repeat it doesn't turn the run before it into a warm-up. Planned intensity 1.1 of threshold, so strides add a few load points, not a session's worth.
- **Fartlek's strides** are 6 × 20 s with 1 min jog, at the end of an easy run (`STRIDES` in `shared/steps.ts`).
- **Block text:** `8 lugnt + strides` / `8 easy + 8 strides` means the easy run, then the strides; written back the same way. Only easy and long runs take them.
- **Week engine:** the first two easy runs of a suggested week end with strides, never the long run ([suggest week](fartlek-suggest-week.md)). The run before them shrinks by what the strides and jogs add, so the week's km stay inside the cap; a run that would get under the 3 km easy minimum keeps none.
- Marathon pace and progressive runs need no new session type: a long run with MP reps, or steps that step up, already say it (the user's view: MP in the description or as steps, progressions as laps).

## Own templates (the session library, smallest version)

Picked up from [the deferred session library](fartlek-session-library.md) once the builder made it cheap: "Spara som mall" in the builder saves the steps under a name, and the runner's templates show next to the built-in ones under "Börja från" everywhere the builder is. Stored in `session_templates` (steps as JSON, handed out as text in the asked language and the runner's units), at most 50 per runner. A new table only, so existing data is untouched.

Still not built: a library view and a day picker. Comparing the same session over time turned out not to need workouts to remember their template ([same session](fartlek-same-session.md)).
