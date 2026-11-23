---
title: Fartlek gym module: log sets in the gym, suggest sessions that suit the run week (plan, not built)
summary: Plan for a gym logger (sets with last time's weight, swap an exercise in one tap) and a simple rule-based session suggester inside Fartlek, why it lives in Fartlek rather than its own app, and how it compares with the gym apps that exist
type: note
status: open
updated: 2026-11-23
---

# Fartlek gym module (plan, not built)

Raised in a chat on 2026-11-23. **Nothing here is built.** It reopens one point of [which days gym and cross-training go on](fartlek-gym-cross-days.md), where Fartlek was not to suggest what to do in the gym; see "What changes" below. Gym as its own session type is in [gym sessions](fartlek-gym-sessions.md).

## Why

- Runners who lift 2–3 times a week want two things the gym apps do poorly: **a suggested routine** that suits running (about half muscle building, half injury prevention), and **swapping an exercise in one tap** when the machine is taken.
- **No app ties strength to the run week.** Running apps (Runna, Strava) have fixed strength sessions you can't edit; lifting apps (Hevy, Strong, Fitbod, RP) know nothing about tomorrow's threshold session. Fartlek already has the week, the key sessions and the gym days, so that is where the module earns its place.
- Don't build something worse than what exists: the logger has to feel at least as quick in the gym as an ordinary log app before the suggester is worth anything.

## Landscape (Nov 2026, from a web search; prices US App Store)

| App | Open source | What matters here |
|---|---|---|
| Bolt – Workout & Strength Log | No (iOS only, free + Pro) | Clean log with "last time" per set and Apple Health; routines and swapping are clunky; CSV export |
| Hevy | No (free up to 4 routines, Pro ~$24/yr) | Smooth log, easy swap mid-workout, no coaching |
| Strong | No (free up to 3 routines) | Clean log, no coaching |
| Fitbod | No (~$96/yr) | Generates each session from per-muscle recovery, swaps in one tap; closest to "suggest a routine" but blind to running |
| RP Hypertrophy | No (~$300/yr) | Feedback-driven volume per mesocycle; pure hypertrophy |
| MacroFactor Workouts (Jeff Nippard's technique videos) | No (~$72/yr) | Program import, programs sold separately |
| Starting Strength | No | Novice barbell program, max strength |
| Runna | No (subscription) | Strength built into the run plan, sessions can't be made or edited |
| Nordic Wellness GymCoachen | No (part of membership) | Builds a session for that gym's equipment; no periodization |
| Liftosaur | Yes | Very flexible, progression written in its own script language |
| wger | Yes (AGPL, Docker) | Free and self-hostable, clunky UI |

Most influencer apps are audience monetization on white-label platforms (Trainerize, Everfit and the like) with subscription pricing, which is why there are so many and why they look alike. The ones that add something are Fitbod (generation) and RP (feedback-driven volume).

## In Fartlek, not its own app

- The thing that makes it better than the log apps is the link to the run week. In Fartlek that is a query; as a separate app it needs an API between two apps, server-to-server sign-in and two data models kept in step.
- Gym is already a session type there: tap Monday's "Gym", start session A, and the synced Garmin `strength_training` activity matches it as today.
- Keep it in its own tables and its own folders (`shared/gym/`, `client/gym/`) so it could be moved out later if people who don't run want it.

## What to build

### 1. Logger (first, on its own)

- **Set rows** with kg × reps, pre-filled with last time's numbers for that exercise ("förra: 40 kg × 10"), and a suggested start weight: if every set hit the top of the rep range last time, +2.5 kg (dumbbells: the next step), otherwise the same.
- **Swap an exercise**: a session is made of slots (a movement pattern), each with a ranked list of alternatives. Swapping is one tap; history follows the exercise, not the slot.
- **Built for the gym floor**: big +/- steppers for kg and reps, no keyboard in the normal flow, the screen kept awake during a session (Wake Lock).
- **Offline**: gyms often have poor signal. A session in progress lives in IndexedDB and syncs when there is a connection; the server takes a whole session at once, idempotent on a client id.
- **Import a CSV export** from another log app (Bolt first) so "last time" works from day one.

### 2. Suggester (only once the logger is used for real)

Rules and data, not an adaptive model:
- **Exercise catalogue** tagged by pattern (knee-dominant single leg, hip hinge, hamstrings, calves, hip abduction, anti-rotation core, push, vertical and horizontal pull, shoulders, arms) and purpose (hypertrophy, prevention, both), with alternatives per pattern.
- **Session templates** as slots: A legs and prevention (single-leg work, hinge, knee-friendly quad work, hamstrings, calves, hip abduction, core), B upper body and core, C a short optional prevention session (slow step-downs, isometric wall sits, tibialis raises, Copenhagen plank).
- **Rules against the run week**: no heavy leg session the day before a threshold, interval or long run (B instead); a lighter run week gives a lighter gym week; a runner who reports joint pain above 3/10 before the session gets C instead of A. Fartlek suggests and the runner decides, as everywhere else ([suggest a week](fartlek-suggest-week.md)).

## What changes in earlier decisions

- [Which days gym and cross-training go on](fartlek-gym-cross-days.md) settled that Fartlek doesn't suggest what to do in the gym. That point is reopened by this page: the suggester above would replace it once built. The day placement and "easy running the day after gym" from that page stand and come first.

## Known limits

- A PWA can't run a rest timer while the phone is locked on iOS. Options: a web push from the server when rest is over (Fartlek already has web-push), or keeping the screen awake. Undecided.
- No Apple Health from a PWA. Garmin covers the activity itself.

## Open questions

- Is the rest timer in the first version, and push or screen awake?
- Does a Garmin `strength_training` FIT file carry sets, reps and weights that could pre-fill the log? Check one real file before relying on it.
- Templates in block text (like the run sessions) or only in the UI?
- How much of the catalogue ships with the app versus what the runner adds.
