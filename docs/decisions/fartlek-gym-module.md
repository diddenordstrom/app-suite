---
title: Fartlek gym module: log sets in the gym, suggest sessions that suit the run week
summary: A gym logger inside Fartlek (sets with last time's weight, swap or add an exercise in one tap, offline, Bolt import) and a rule-based choice of template from the run week; why it lives in Fartlek, how it compares with the gym apps that exist, what is built and what is left
type: note
status: open
updated: 2026-11-24
---

# Fartlek gym module

Raised in a chat on 2026-11-23; **a first version was built the same day** (see "Built" below). It reopens one point of [which days gym and cross-training go on](fartlek-gym-cross-days.md), where Fartlek was not to suggest what to do in the gym; see "What changes" below. Gym as its own session type is in [gym sessions](fartlek-gym-sessions.md).

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

## Flow and navigation (settled 2026-11-23)

Drawn in a private mock with six phone screens. Runna works the same way: strength sits in the plan as an ordinary session, reached from the day, with no tab of its own (and behind its subscription, 1 099 kr a year in Nov 2026).

1. **Home → the Idag card** shows today's gym session: template, number of exercises and time, the first exercises with last time's weights, and one line on *why* today suits it ("threshold Friday, long run Sunday, so heavy legs today"). Buttons: "Öppna pass" and "Annat pass".
2. **The session page** asks "start?": tabs for templates A, B and C, the exercise list with planned sets and weights, a swap button on each exercise and "Lägg till övning" (so the session can be changed before it starts, not only during it) and "Starta pass".
3. **"Annat pass"** opens a sheet: today's session, **a free gym session** (template A, B or C, or empty) for a gym day with nothing planned, and **move today's session** to another day with what it does to the key sessions. No "free run": Fartlek doesn't record runs, Garmin does.
4. **In the session**: set rows with steppers, swap per slot, rest after each set.
5. **Done**: time, sets, volume, what beat last time, the Garmin activity matched, and the next gym session with its reason.

- **No gym tab at first.** Templates and the exercise catalogue live under Plan, gym history under Activities next to the runs. A fifth tab fits on a phone and can come later if a shortcut is missed; a tab is easy to add and hard to take away.
- **No joint check-in in the first version** (dropped 2026-11-23, after first planning three buttons *Inget · Lite · Ont* where "Ont" offered C). The runner picks A, B or C on the session page; the suggestion only preselects one. The `feel` column stays so the question can come back without a migration.
- **Rest timer**: nice to have, not needed for the first version.
- **One gym session a week gets the full-body template F** (settled 2026-11-23): legs and prevention first (single leg, hinge, calves, outer hip), then a press and a row. With A and B in turns the legs would only come every other week, and they are what protects the running. Chosen when the week holds exactly one planned gym session; two or more go back to A/B.
- **Not only legs and prevention.** Upper-body work (bench press, pulls, arms) is logged in the same module through template B or a free session, so the runner needs no second log app.

## Data

Hardly any, and no model to train:
- the exercise catalogue (60–100 exercises with pattern and purpose tags) and the templates are written by hand once and ship with the app;
- the runner's own sets (exercise, kg, reps, date) are a few thousand rows a year.

"Last time", the suggested weight and "better than last time" are computed from the runner's own log. The log starts empty, which the CSV import covers. The hard part is the feel on the gym floor, not the data.

## Built (first version, 2026-11-23)

- **Catalogue and templates** in [`shared/gym.ts`](../../apps/fartlek/src/shared/gym.ts): about 60 exercises with pattern, load kind (kg, body weight, held), purpose and weight step, plus the names other apps export (Bolt) as aliases. Templates A, B and C as slots with ranked choices. Names are i18n keys `ex.<id>`; an exercise the catalogue doesn't know is stored as `x:<name>` and keeps its name.
- **Logic** in [`shared/gymplan.ts`](../../apps/fartlek/src/shared/gymplan.ts): double progression (every work set at the top of the range: one step up and back to the bottom; else repeat last time set by set; body weight +1 rep, holds +5 s), the template for the day (F when the week has one planned gym session; C only by hand; B the day before a threshold, interval, long run or race; else A and B take turns, legs first), improvements over last time, and a check of what the client sends. Warm-up and drop sets are stored but never count as "last time" or volume.
- **Storage**: `gym_sessions` and `gym_sets` (migration `0022_gym`), part of "delete training data". A session is saved once per `clientId` made on the phone, so a resend is harmless. Routes in [`routes/gym.ts`](../../apps/fartlek/src/server/routes/gym.ts): `GET /gym?date=` (planned session, suggested template with its reason, last time per exercise, sessions logged that day, done/planned the last four weeks), `POST /gym/sessions`, list, one, delete, and `POST /gym/import` for a Bolt CSV (sessions already imported are skipped).
- **Pages**: `/gym` (session page, session in progress, done) and `/gym/history` (sessions, detail, Bolt import). Reached from "Öppna pass" on today's gym session in the Idag card, "Nytt pass" in the history, and a link from Activities. No tab.
- **Order and search**: a handle on each row of the session page reorders the exercises (drag with touch or mouse, or arrow keys). The exercise search covers both languages and export names.
- **On the gym floor**: steppers and a typed value for kg, reps and seconds, the next open set focused after each tick, a count-up rest clock since the last set, the screen kept awake (Wake Lock) where the browser allows it.
- **Offline**: the session in progress is kept in the browser's `localStorage`, not IndexedDB as first planned (one small JSON object is all it needs). A finished session that can't be sent waits in an outbox and is sent when the gym pages open or the phone comes online.
- **News and landing page**: its own "what's new" note (December 2026, not part of the November one) and a gym section with a FAQ entry on the [Fartlek landing page](fartlek-landing-page.md).
- **Demo**: gym planned on Mondays and logged A/B sessions with weights that creep up.

## Your own version of a template (settled 2026-11-24)

Asked for by the user: a swap made in one session was gone the next time, because every session started from the template's first choices.

- **The last finished session on a template is the new template.** Everything done to it sticks: swaps (before or during the session), order, exercises added, exercises removed, the number of sets. A session that is discarded doesn't count, and a free session leaves the templates alone.
- **Skipped is not removed.** An exercise with no set ticked (time ran out) stays in the template; one removed with the cross, or whose sets were all removed, is gone. So the session stores its layout (`gym_sessions.layout`, JSON: exercise, slot, sets and rep range), not only the sets logged. Sessions from before this have no layout and start from the suggestion.
- **No setup step first.** A blank routine builder is heavy before the runner has stood in the gym, and the suggested templates are the part that knows the run week. With this rule the templates become the runner's own after a few sessions anyway. Runna, for comparison, has fixed strength sessions that can't be edited.
- **On the session page:** while the runner has no version of any template, one line says the session is a suggestion and that what they finish becomes their session next time. With their own version it says "Your version from 17 Nov · Reset to the suggestion"; after a reset, "Use your version" brings it back. The reset only changes that session; finishing it makes the suggestion the new version.
- **Later, if missed:** editing the templates at rest under Plan, and routines of their own next to A/B/C/F ("Save as routine"). Own routines would need a tag (legs, upper, full body) to take part in the suggestion from the run week.

## Left to build

- The "Annat pass" sheet on Home (free session and moving today's session); a free session is reached from the history for now.
- "A lighter run week gives a lighter gym week" (the suggester only picks the template).
- A rest timer that counts down and notifies; the planner placing gym days ([gym and cross days](fartlek-gym-cross-days.md)).
- Matching a logged session to its planned workout without a Garmin activity (today the plan shows a gym session as done only when Garmin syncs one).

## The plan as first written

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
- **Rules against the run week**: no heavy leg session the day before a threshold, interval or long run (B instead); a lighter run week gives a lighter gym week. Fartlek suggests and the runner decides, as everywhere else ([suggest a week](fartlek-suggest-week.md)).

## What changes in earlier decisions

- [Which days gym and cross-training go on](fartlek-gym-cross-days.md) settled that Fartlek doesn't suggest what to do in the gym. That point is reopened by this page: the gym page now suggests a template, while the planner still only places the day. The day placement and "easy running the day after gym" from that page stand and come first.

## Known limits

- A PWA can't run a rest timer while the phone is locked on iOS. Options: a web push from the server when rest is over (Fartlek already has web-push), or keeping the screen awake. Undecided.
- No Apple Health from a PWA. Garmin covers the activity itself.

## Open questions


- When the rest timer comes: push or screen awake?
- Does a Garmin `strength_training` FIT file carry sets, reps and weights that could pre-fill the log? Check one real file before relying on it.
- Templates in block text (like the run sessions) or only in the UI?
- How much of the catalogue ships with the app versus what the runner adds.
