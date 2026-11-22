---
title: Fartlek's morning notification: today's session and today's form
summary: A push at a time the runner picks with today's sessions and form score; with Garmin it syncs first and waits up to two hours for last night's HRV or sleep
type: decision
status: accepted
updated: 2026-11-20
---

# Morning notification

Asked for: a notification for today's workout and today's form ("dagsformen") on the iPhone home-screen app. Built on the shared [Web Push](web-push.md); the card is under Settings → Notiser.

## Decision

- **What it says** is what the [Idag card](fartlek-today.md) opens with: title "Idag: tröskel 10 km + gym" (or "Vilodag"), body "Dagsform 6/10, ta det lite lugnare", "(osäker)" when HRV or resting HR is missing, and "Det finns ett förslag i appen" when the card has one (low form on a key session, a missed run to move). Without a score: asks for a check-in. Sessions already run today are left out. Tapping opens Home. Pure parts in `shared/morning.ts`, text in `server/morning.ts`.
- **When**: a local time per runner (default 08:00, `morning_push`), once a day, in the runner's timezone setting. A server that was down at the time sends later the same day.
- **Garmin first**: with Garmin connected the server syncs at the time (so last night is in) and asks again every 15 minutes until last night's HRV or sleep score is there, at most two hours, then sends without it. This is the one sync not started by a visit (the "only on visit" rule in `sync.ts` otherwise stands).
- A time set later today still sends today; one already passed starts tomorrow. "Skicka dagens nu" sends today's at once, to see it.

## Open

- **Scale**: the tick syncs and sends one user at a time, so at a few hundred users the last one at 08:00 waits close to an hour. Run syncs in parallel with a cap and spread them a little around the time (on the [roadmap](fartlek-roadmap.md)).

- Other notifications (a missed key session, Monday's check-in, the Garmin key running out) would reuse the same pieces; none asked for yet.
