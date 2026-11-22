# Fartlek demo snapshot

`demo-snapshot.json` started as real API output from a Fartlek **demo** account (made-up data from `apps/fartlek/src/server/seed.ts` and `providers/demo.ts`) and was then **hand-tuned for the landing page** so the story reads well. The page feeds it to Fartlek's own chart and card components (`../live/screens.tsx`) so they render live in both themes. Its shape is typed in `../live/snapshot.ts`.

## Hand-tuned (2026-11-20)

The generator script is only a starting point: regenerating overwrites these edits. `apps/portfolio/scripts/fartlek-landing-tune.py <file>` reapplies them to a fresh export (it rewrites the file in place; it was written against the 2026-11-20 export, so check its fixed dates and ids before rerunning). Every change keeps Fartlek's own formulas:

- **Paces × 268/292** everywhere they appear (best-effort curves, critical speed and its auto efforts, threshold 287 → 263 s/km, the threshold run's laps, steps, targets and stream), so CS is 4:28/km, plausible for a ~3:30 marathoner. Best-effort distances follow (same durations); the threshold run keeps its 12.4 km and gets shorter. Loads, HR and volume are unchanged.
- **Current 1–30 min bests** follow the CS model (distance = CS × time + D′, CS 268 s/km, D′ 120 m; the previous period 6 s/km slower), so the automatic CS fit gives 4:28/km with a believable D′ instead of Fartlek's "D′ under 100 m" warning from flat threshold reps.
- **CS zones** recomputed: first threshold = CS ÷ 0.823 (0.836–0.811).
- **Race predictions** recomputed from the faster 30-min effort: half by Riegel from the 30-min best (1:38:56, goal 1:38:00); marathon = median of Vickers (3:43:01), CS × 0.88 durability (3:34:10) and Tanda (3:30:17), so 3:34:10 against the 3:30 goal. Histories are a straight −22 s/week (marathon) and −9 s/week (half) towards those values.
- **Today's form**: no knee pain (pain signal 0, no pain trend); sleep score 58 takes 0.6 → 9/10, "fine". Fitness/fatigue/form are untouched (form = yesterday's fitness − fatigue, already consistent).
- **Fuelling**: 45 → 50 → 55 (bloating 2/10) → 60 → 70 → 70 g/h on the long runs, carbs = g/h × minutes; advice is what `fuelAdvice` gives for that: hold 70 g/h for 7 more clean days.
- **Names** stay as the seed wrote them (English block and run names, Swedish "Tröskel 3x2 km"); the page swaps them for its own strings in the page's language (`DEMO_NAMES` in `../live/snapshot.ts`, `fartlek.landing.demo.*`). The tune script stops on a name that has no entry there.

## Regenerate

```sh
# terminal 1 (apps/fartlek)
PORT=3000 DATABASE_PATH=/tmp/fdata/app.db AUTH_MODE=dev DEMO_ENABLED=true \
  SESSION_SECRET=<32+ chars> PUBLIC_URL=http://localhost:5173 npx tsx src/server/index.ts
# terminal 2 (apps/fartlek)
npx vite --port 5173
# then, from the repo root
node apps/portfolio/scripts/fartlek-snapshot.mjs            # or pass a base URL
```

The script starts a demo session (`GET /demo`, at most 5 per IP per hour; set `DEMO_SID=<cookie>` to reuse one) and refuses to run unless `/api/auth/me` says `authMode: "demo"`. It then:

- logs RPE on every run in the last 6 weeks and carbs/stomach on the long runs (45 → 65 g/h, one 2/10 bloating). **The seed has no activity logs**, so the fuel and sRPE data comes from these script entries, not from the seed.
- drops `sub`, `email`, `userId`, `user` keys and any free-text `note`.

Dates are relative to the day it was run (`_meta.generatedFor`). If you regenerate, the numbers change slightly, so check the copy.

## Sections → component → data

| key | Fartlek component (apps/fartlek/src/client) | props / data shape |
|---|---|---|
| `settings` | `useSettings()` (`SeasonStrip` reads `weekStart`; zones/easy band elsewhere) | `Settings` from `GET /api/settings` |
| `today.home` | `TodayCard` + `Score` in `today.tsx` (readiness, missed-session card); week ring/`WeekList`, `NextRace` and load card in `pages/Home.tsx` | `TodayCard({ data: HomeData, onChanged, signals: ReactNode, checkin: ReactNode })`, `Score({ data: HomeData })`; `HomeData` in `types.ts` (`GET /api/home`) |
| `load` | Load card inline in `pages/Trends.tsx` (~l.89-104): `LineChart` from `@homelab/ui` with `ctl`/`atl`/`tsb` series, `dashedFrom` = first `projected` point | `{ today, load: { series: {date, load, ctl, atl, tsb, formPct, projected?}[], race, planEnd }, weekly }` = `TrendsData["load"]` (`GET /api/trends?weeks=12`) |
| `pace` | `BestPaceCard({ best: BestEffortsData })`, `CsBody({ cs: CsView, olderTest: CsTest \| null, thresholdPace })` in `perf.tsx` | `best`, `cs` (`latest`, `tests`, `olderTest`), `threshold.current.paceSecPerKm` from `TrendsData` |
| `fuel` | Fuel and sRPE cards inline in `pages/Trends.tsx` (~l.106-147), `LineChart` | `TrendsData["log"]`: `fuel[] {id,date,name,gPerH,gi}`, `fuelAdvice {gPerH, action, reason{key,params}}`, `srpe[] {date,srpe,load,trimp}`, `durability[]` |
| `race` | `PredictionBody({ pred: RacePredictionData, goalSeconds, distanceKm })` in `perf.tsx`; list/`Hints` in `pages/Races.tsx` | `races: Race[]` (from `GET /api/plan`), `predictions: RacePredictionData[]` (`GET /api/races/predictions`, match on `raceId`), `hints: Record<raceId, RaceHints>` |
| `week` | `SuggestWeekDialog` in `suggestweek.tsx` (fetches itself); inner `Simulation`/`SimLines`, `Editor({ seed, s, replaces, … })`, `Stats({ seed, ev })`, `Charts({ seed, ev })`, `MoreDays({ advice })`. Only `SimLines`, `MoreDays`, `DayCell`, `Warnings` are exported. | `response` = `GET /api/plan/next-week?weekStart=…`: `{ ok, seed: WeekSeed, suggestion: Suggestion, replaces: Workout[], advice: DaysAdvice \| null }` (types in `shared/nextweek.ts`) |
| `block` | `SeasonStrip({ data: BlocksData, selected, onSelect })` in `pages/Blocks.tsx`; `BlockCard` same file | `BlocksData` = `{ today, blocks: BlockWithSummary[], races }` (`GET /api/blocks`) |
| `activity` | `PlannedCard({ activityId, planned, lapStarts, onChange })` in `stepresults.tsx`; `Curves({ series, bands })` in `curves.tsx`; `SameSessionCard({ activityId })` in `samesession.tsx` (fetches itself; data is in `sameSession`); stats in `pages/Activities.tsx` `ActivityPage` | `detail: ActivityDetail` (`GET /api/activities/:id`; `planned = { workout, match, suggestion }`, `laps`, `series {t,hr,pace,alt,cad}[]`), `sameSession` (`GET /api/activities/:id/same-session`) |

Some components are not exported (`Stats`, `Charts`, `Editor`; `Score`, `Sessions`, `WeekList`, `SignalList` and `SeasonStrip` now are) or call the API themselves (`SuggestWeekDialog`, `PlannedCard` actions), so using them from portfolio needs exports or thin wrappers in Fartlek.
