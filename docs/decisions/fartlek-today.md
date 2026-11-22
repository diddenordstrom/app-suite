---
title: Fartlek Home starts with "Idag", and suggests only when something happened
summary: Today's form and today's session in one card with the reasons behind ⓘ; a missed run can be moved or struck (and its km spread); low form on a key session asks how the body feels; week ring and list merged
type: decision
status: accepted
updated: 2026-11-12
---

# Fartlek Home starts with "Idag", and suggests only when something happened

Item 1 and the first part of item 3 of the [roadmap](fartlek-roadmap.md). Mocked on 2026-11-12 in the Claude Design canvas **"Fartlek – Home med Idag"**: a normal day, ⓘ and signals open, a missed run, after striking it, and low form on a key session. Code: [`shared/today.ts`](../../apps/fartlek/src/shared/today.ts) (rules and tests), [`client/today.tsx`](../../apps/fartlek/src/client/today.tsx) (the card).

## Layout

- **Idag** (was Dagsform): the score and verdict, then today's planned session(s), or "Inget planerat idag". What took the score down ("−2 för veckans km") moved behind an ⓘ by the score; the signal list folds away behind "Visa underlag". Transparent when asked, quiet otherwise. The check-in stays as a small row.
- **Veckan** = the old week ring + "Kvar den här veckan": ring beside the week's sessions in date order (done ticked, today marked, earlier and not done in warning colour). Vecka/Månad moved from the page header into this card. The header is now the date and week number.
- **Lopp** is one line per race: "Mål 3:30 · behöver tröskel 4:58, har 5:10". A predicted finish time replaces this when [the prediction](fartlek-roadmap.md) is built.
- Senaste passet and Belastning stay, smaller.

## When the card suggests something

Principle from the chat: the form score **warns, it doesn't steer**. A runner shouldn't train below par for a week because sleep was a bit worse; if they feel fresh, they run. Everything is a suggestion that changes nothing until accepted ([never lock anything in](fartlek-suggest-week.md)).

- **Score 6–10:** no suggestion; the verdict's text is all.
- **A run missed earlier this week** (planned on a day already gone, still unmatched; matching is flexible within the week, so it isn't "missed" yet): *move it* to the first day left this week where it fits (no other run that day; a hard session never next to another hard one; usual run days first), *strike it*, or "Jag sprang, synka".
- **After striking:** "Fördela om resten av veckan?" spreads the struck km in whole km over the easy runs and long run still ahead (not today's, not structured ones): easy runs at most +30 %, the long run +20 %. What doesn't fit is left out on purpose and said so. Nothing beyond that, so a struck session never turns into four crammed ones.
- **A key session ahead made too big by a missed one** (2026-11-13, [key sessions first](fartlek-key-sessions-first.md)): the next long run in 7 days over the 30-day rule comes back to the long run's step, the next threshold session ahead of the ladder comes back to the rung after the last one run. "Ändra till …" or "Behåll planen".
- **Low form on a key session** (verdict "dra ner", score ≤ 5, and today's session is threshold, intervals or a long run): the card asks "Hur känns kroppen inför …?" with **Pigg / Som vanligt / Seg**. Pigg sets the suggestion aside; the other two show it: swap with a later easy run in the week where the key session fits, else move it to a free day where it fits. The pain veto (8+) is unchanged and stays the only hard no.

## Why a feel question and not a "kör ändå" button

Mood was taken out of the score as too fluffy ([today's form](fartlek-readiness.md)). This is the other direction: feel can only **clear** a warning, never create one (soreness and pain already do that), and it never changes the number. It is stored per day (`checkins.feel`), so later Fartlek can show how sessions run against the warning went and whether the thresholds are too sensitive for this runner.

## Passed over

- Daily suggestions, and suggestions on 6–7: too sensitive.
- What-if numbers for form on the suggestions (the mock showed "form på söndag −14 → −9"): left out of the first version; a swap within the week barely moves week-end form, and the coach already shows form when editing the plan.
- Keeping the struck-session redistribution on reload: the offer lives until the card reloads; striking is the decision, spreading is a bonus.
