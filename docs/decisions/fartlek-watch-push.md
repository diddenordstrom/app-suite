---
title: Fartlek workouts to the watch via intervals.icu
summary: Structured workouts reach the Garmin watch through intervals.icu (API key now, OAuth later), not a .FIT download; how the push works and what it needs on the intervals.icu side
type: decision
status: accepted
updated: 2026-11-13
---

# Fartlek workouts to the watch via intervals.icu

## Why intervals.icu

Fartlek has steps on planned workouts ([fartlek-structured-workouts](fartlek-structured-workouts.md)); the runner wants them on the watch without retyping them in Garmin Connect.

- **Garmin directly:** the personal API key we sync with is pull only. Pushing workouts needs the Training API, which is in Garmin's business tiers (application and verification). There is no consumer OAuth to Garmin.
- **.FIT download** (PR #76, closed): built and working, but Garmin Connect can't import a workout file, so it had to be copied to `GARMIN/NewFiles` over USB. Impossible from a phone; the user found the manual step pointless.
- **Garmin's unofficial web API** (what `garth` and several MCP servers use): would mean storing the Garmin password and handling MFA, and breaks when Garmin changes things. Out, with other people using the app and the repo being open source.
- **Strava:** has no planned workouts to send on to Garmin.
- **Tredict:** no endpoint that puts a workout on a calendar date (only plans + "change date"), write access must be bought, and it doesn't hand out OAuth credentials to apps that mostly forward data.
- **Terra:** a paid business API; overkill.
- **intervals.icu (chosen):** free, documented REST API with a personal key and OAuth for apps; "Upload planned workouts" sends the next week of planned workouts to Garmin Connect, and they sync to the watch.

It is shown as an add-on: "Skicka pass till klockan – kräver ett gratis konto på intervals.icu". Other partners could sit beside it later.

## Add-ons in Settings

Settings has a **Tillägg** section under the Garmin card (Garmin stays apart: every user needs it). Each add-on is a compact card: name, one line on what it does, what it needs, and **Koppla** / **Inställningar** that opens its setup or details; when connected only the status line (and any warning) shows. A separate page waits until there are two or three add-ons.

Finding it: where a workout could go to the watch but the add-on isn't connected (today's session on Home with steps, the plan's workout dialog), a quiet "Skicka passen till klockan? Koppla tillägget →" links to `/settings#addon-intervals`, which opens and scrolls to the card. Not in the demo.

Other add-ons looked at (Nov 2026):
- **intervals.icu as a data source** (activities and wellness), the most useful next one: it would let COROS, Polar, Suunto and Wahoo users use Fartlek without a Garmin key. intervals.icu also sends planned workouts on to Wahoo and COROS, so the watch add-on already covers those.
- **Strava**: no planned workouts; since June 2026 a paid developer tier and limits on passing data on. Not worth it.
- **Runna**: no API.
- **COROS directly**: partner API by application only.
- **Wahoo directly**: the Cloud API takes plans, but it needs a registered developer app; intervals.icu already does it.

## Built (API key; OAuth waits)

- **Settings card** "Skicka pass till klockan": steps to set up intervals.icu (connect Garmin, tick "Upload planned workouts", set a run threshold pace, create an API key), paste the key. The key is checked against `GET /api/v1/athlete/0`, stored encrypted like the Garmin key, never returned. Not offered in the demo.
- **Push = reconcile** (`server/intervals.ts`): after any non-GET request (whatever route changed the plan) a push is scheduled, debounced 3 s per user; a visit pushes again when the last push is over 6 h old so the window moves. It takes planned running workouts with steps in the coming 14 days, compares a hash with what was sent (`intervals_events`), upserts changed ones (`events/bulk?upsert=true`, `external_id` = `fartlek-<id>`) and deletes ones that left the window while upcoming (deleted, dropped, moved out, steps removed). Past events are left alone there.
- **Workout text** (`shared/intervalsdoc.ts`): intervals.icu parses the event description, and only a parsed workout reaches Garmin. Targets resolve with Fartlek's refs for the date (the window planned vs actual judges). Pace is absolute (`4:20/km-4:40/km Pace`). The syntax has no absolute bpm, so HR is written as % of intervals.icu's own LTHR (read on each push), which it turns back into the same bpm. Rest only between reps, as in `flattenSteps`: (rep, rest) × (n−1) plus a last rep, so laps match the plan 1:1. Name = steps summary in the language chosen when connecting; the workout's notes follow the steps.
- **Warnings on the card:** no run threshold pace on intervals.icu (pace steps then reach Garmin as "no target", a known intervals.icu behaviour), no LTHR when an HR step needed it, or intervals.icu parsed fewer steps than sent (checked against the `workout_doc` it returns).
- **Home, today's session:** with the add-on connected and steps on the session, "✓ Skickat till klockan" when it went, and **Skicka till klockan** / **Skicka igen** to send that one workout now (`POST /api/intervals/push/:id`, sent even if unchanged). The automatic push stays; the button is for confirming and for "I just changed it, send it now". The same button sits in the plan's workout dialog, beside Stryk, for a saved and unchanged planned workout with steps within the two-week window.
- **Disconnect** deletes the upcoming events Fartlek sent, then the key.

## Open

- **Not yet tried against the real intervals.icu** (the build sandbox can't reach it): the request shapes follow intervals.icu's forum docs, tests use a stand-in. First real connect should check: upsert by `external_id` with an API key, step parsing of the description, pace targets on the watch.
- **OAuth** ("Koppla ihop" without a key) once an app is registered with intervals.icu (by mail); a self-hosted copy keeps the key path since it can't share the client secret.
- Maybe the same sent mark on the plan's week chips.
