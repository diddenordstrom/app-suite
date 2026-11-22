---
title: Etapp day view: read first, live editing, vias, idea bank
summary: Why Etapp's day became a read-mode timeline with live editing, vias, an idea bank, discover links, stop photos and a typed-in drive time
type: decision
status: accepted
updated: 2026-11-22
---

# Etapp day view

## What the app is for

Etapp plans a 7–10 day car trip with a roof tent (the trip it was built for: southern Sweden to Lom, Galdhøpiggen and the fjords). The plan is made at home but changes on the road. The main job is to help **find** things worth stopping for, which is hard from home in another country; most inspiration comes from YouTube, Reddit and Instagram.

## Decision

- **Read mode first.** A day is a timeline: start, vias, stops, night. Stop cards show photo, name, progress and the first three todos (tickable). The old view showed every stop as an open form, with a "no position" warning on each and directions between every pair, so there was no overview.
- **Live editing.** Tapping a stop opens it in place; every field saves itself on blur (no Edit/Save). Only one thing is open at a time, so scrolling cannot edit by accident.
- **Two levels stay.** A stop is a place you go to and explore; its todos are the checklist there. This was deliberate and kept.
- **Vias.** A third, light kind of stop (`kind = "via"`): steers the route, no todos, no number. The old plan used towns as stops just to steer Google Maps.
- **Idea bank.** Stops with `day_id` null: places saved for later, moved onto a day with one tap. Saving a pasted link creates an idea named "Ny idé" with that link.
- **Discover links per stop.** Google Maps searches (sights, viewpoints, food) plus ut.no, eBird and Park4night at the stop's position. Plain links, no API keys.
- **Inspiration links** on a stop or idea, with a note ("the view at 4:30").
- **One photo per stop or idea** ("what the place looks like", often a screenshot). Several photos and trip photos were left out: that is a travel diary, another app.
- **Drive time is typed in** from Google Maps per day (`drive_minutes`), with a "Lång dag" badge above 6 h. No routing service: the whole route already opens in Google Maps, and a routing API would cost a key and a dependency. The old straight-line estimate stays only in the trip summary and map.
- **One "Lägg till" sheet** (the raised tab bar button): stop, via, night or idea from one field that takes a name, coordinates or a long Maps link. Quick entry stays, folded under "Planera resan" with start and date, and learns `via X` lines.

## Passed over

- Starting from scratch: the backend, sharing, live updates, offline ticks and link logic were sound and tested; only the planning UI and model needed work.
- Flattening todos into separate locations: more places to maintain.
- Apple Maps for the whole route: its links take a start and a destination, not waypoints, as far as we know.

## Open

- The ut.no, eBird and Park4night link formats were written from memory and not yet tested on a phone; at worst they open the service's search page.
- Editing the plan offline (only ticks queue today).

## Migration note

Making `stops.day_id` nullable needs a table rebuild. Drizzle's migrator runs in a transaction, where `PRAGMA foreign_keys=OFF` does nothing, so the generated `DROP TABLE stops` would have cascade-deleted every todo. [0001_dagvy.sql](../../apps/etapp/drizzle/0001_dagvy.sql) copies todos aside and puts them back; watch for this in any future SQLite rebuild.
