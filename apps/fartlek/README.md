# fartlek

Self-hosted, multi-user training planner for self-coached runners: a TrainingPeaks alternative built on Garmin data. Plan weeks and months, then see honestly whether you're on track. A missed or moved session never "breaks" the plan.

## Features
- **Garmin sync** with each user's own personal API key (encrypted at rest, AES-256-GCM). Pulls activities, FIT laps and a 5 s HR/pace stream for runs, plus HRV, resting HR and Body Battery.
- **Plan calendar**: week, month and block views, drag to move (Alt/Ctrl to copy), copy weeks, weekly targets. Week rows show their block, the easy-session Z1–2 share, and a ▲ on planned runs more than 10 % longer than the longest run in the 30 days before.
- **Training blocks** (base, build, specific, taper, recovery): a season strip, a card per block (volume and key sessions decide the status; easy-session intensity is shown beside it) and a week list. A block is written and edited as text, one line per week in the old quick-add syntax (`6 zone 2, 9 tröskel, 15 long run`); saving shows a preview and applies only the difference, keeping days, notes and linked runs.
- **Flexible matching**: runs match the week's sessions by closest distance; threshold runs take threshold sessions; manual link and unlink available.
- **On track** per week and month, with reasons. Within about 15% counts as on track, and one missed session never makes a week behind.
- **Races** with A/B/C priority, goal pace and needed threshold, a taper suggestion for A races and volume / longest-run hints for halves and marathons.
- **Load** (rTSS, else hrTSS, else duration) with fitness, fatigue and form, projected to race day from the plan.
- **Thresholds** with history, interval detection, range check and proposals. **Zones** come from the watch or your own settings, plus a custom easy band.
- **Trends**: weekly volume, threshold pace and HR, easy pace at the same HR, easy score, intensity distribution, pain, HRV and resting HR.
- **Recovery**: pain log per area with trend, daily check-in, and readiness advice. Advice never edits the plan.
- **Activity log**: per activity a note, sRPE (0–10 × minutes), carbs taken (g, shown as g/h) and stomach symptoms. Trends shows fueling over time with a gut-training suggestion (start near 60 g/h, +10 g/h every other week while the stomach copes), felt effort against measured load, and durability (pace-to-HR drift in the last third of long runs). Advice never edits the plan. Edwards **TRIMP** (minutes per HR zone × zone number) sits next to sRPE and rTSS.
- **Critical speed**: enter two or three maximal efforts (3–12 min) or the 3-minute test in Settings to get CS and D′, the first threshold (about 82 % of CS) and the threshold window. It is compared with your entered threshold but never replaces it; load still uses the entered threshold.
- **Demo data** (Settings → Load demo data) lets you try everything without a Garmin key.
- **Demo mode** (`/demo`, linked from the portfolio and the sign-in screen): visitors without an account get their own throwaway database file (in `demo/`) filled with demo data. At most 100 at once, deleted after 2 hours without use or when the visitor ends the demo, 5 starts per IP per hour. Garmin can't be connected there. Turned on with `DEMO_ENABLED=true`; see [docs/decisions/demo-mode.md](../../docs/decisions/demo-mode.md).

## Run locally
```
cp .env.example .env
npm install
npm run dev        # API :3000 + Vite :5173, dev mode auto-logs in a fake user
```

## Deploy
See `compose.example.yml`. Production requires `SESSION_SECRET`, `RUNPLAN_MASTER_KEY` (≥ 32 chars, or `RUNPLAN_MASTER_KEY_FILE`), `PUBLIC_URL`, and an OIDC client (redirect `https://<host>/api/auth/callback`). Migrations run at startup. Back up the SQLite file in `/data`.

## Layout
- `src/server`: Hono API (`routes/`), Garmin and demo providers (`providers/`), sync, encryption, Drizzle schema.
- `src/client`: React PWA pages on the shared UI kit (`ui/`, including hand-rolled SVG charts).
- `src/shared`: pure logic with tests: parser, matching, compliance, load, zones, threshold, recovery.

Client modules must not share a name with a route or `/api` (Vite serves `/settings` as `settings.tsx` if that file exists), hence `http.ts` and `prefs.tsx`.

## Scripts
`dev` · `build` · `start` · `test` · `typecheck` · `lint` · `check` · `db:generate`
