---
title: Fartlek session library (deferred)
summary: A library of saved sessions was mocked and then put off, because today's plan has too little variety for it to pay; what would make it worth building and the smallest version
type: decision
status: superseded
updated: 2026-11-13
---

# Fartlek session library (deferred)

> Superseded on 2026-11-13: the smallest version (save as template, templates beside the built-in ones) came with the [session builder](fartlek-session-builder.md). The rest below still holds.

Build order 5 of [structured workouts](fartlek-structured-workouts.md). Mocked on 2026-11-12 in the Claude Design canvas **"Fartlek – passbibliotek"**. The canvas has four boards:

1. Plan › Bibliotek as a fourth view beside Vecka · Månad · Block, with your templates, a type filter, "Lägg i planen" with a day picker, and suggested templates to add.
2. The workout dialog with "Från biblioteket" and "Spara som mall".
3. The block editor's "+ Från biblioteket" in place of the grey "+ Spara som mall".
4. The phone list with a bottom sheet to put a template in the plan.

## Decided: not now

Asked to be critical of the mock, the user agreed it would mostly add logic that isn't used:

- **The plan has three kinds of session** (easy, threshold, long run), and only threshold sessions have structure. The block editor's **+ Tröskel** (reps × minutes, steps generated) already is a template for those.
- **Repeating a session** is already covered by copying a workout or a week (steps included) and by copying a block text line with its steps in parentheses.
- **A library pays when sessions vary** (hill reps, 6×1 km, progressive long runs, so the steps aren't retyped). Today's plan doesn't.
- The grey, disabled **"+ Spara som mall"** button in the block editor (from [fartlek-block-coach.md](fartlek-block-coach.md)) promised a feature that doesn't exist, so it was removed.

## When to pick it up again

- **Retyping the same steps often** → the smallest version: "Spara som mall" in the workout dialog, and saved templates appear as extra quick-add chips next to + Tröskel (for example "+ Tröskel 2×15"). No library view, no suggestions, no day picker. About half the mock's work.
- **Comparing the same session over time** ("Tröskel 3×8: rep 3 was 6 s/km slower in September") → the full library is worth it, but only with **workouts remembering which template they came from**. Add that link from the start, since it can't be recovered for workouts already planned.

The mock's assumptions still stand if it is built:
- putting a template in the plan copies it, so editing the template later leaves planned workouts alone
- sizes are estimated from the threshold and easy pace
- no usage statistics without the link above
