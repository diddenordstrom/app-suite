---
title: Brygga, the FIRE calculator: a login-free app that keeps everything in the browser
summary: Plan for moving the FIRE/bridge calculator (draft 4) into the suite: no server data, single/duo mode, ISK and pension tax in the simulation, build order
type: decision
status: accepted
updated: 2026-11-09
---

# FIRE calculator

The calculator started as a standalone HTML page ("Nettoförmögenhet, brygga & sluttid", draft 4, built in the claude.ai project *financial calculators*; copy in [raw/fire-calculator-draft-4.html](../raw/fire-calculator-draft-4.html)). It answers one question: **when can I stop working, given that liquid capital has to carry me until the public pension starts?** That bridge period is what sets it apart from generic FIRE calculators. This page is the plan for making it an app in the suite.

## Decisions

- **No server data, no login.** Everything stays in the visitor's browser (`localStorage`). The app is open to anyone, like the portfolio: a Hono server that only serves the static client, no database, no secrets. Reason: the numbers are sensitive, and with nothing stored there is nothing to protect, back up or migrate.
- **Single mode by default, duo mode as an option.** Duo adds a second person so a couple can plan together (see [Duo mode](#duo-mode)).
- **Tax is part of the simulation:** ISK schablon tax on stocks/funds and income tax on pension payouts (see [Model changes](#model-changes)).
- **The engine is pure TypeScript in `src/shared/`** with vitest tests, taking one input object instead of reading the DOM. Status texts become message keys + params, per the repo rule.
- **UI from `packages/ui`**: `Field`, `SegmentedControl`, `LineChart` (replacing the hand-drawn canvas), Skymning tokens, light/dark, sv/en.
- **Added to the portfolio last**, as the final step before the PR, once the model feels finished.
- **No minPension integration in v1** (see [minPension](#minpension)).

## Name: Brygga

The app is called **Brygga** (`apps/brygga`, `ghcr.io/<owner>/brygga`, `brygga.didrik.dev`), after the bridge period it is built around. It was first passed over as too vague; Sluttid, Mellanår, Brofäste and Frihetsdag were considered, and Brygga was chosen in the end.

## Duo mode

- Each person has their own age, salary, salary growth, public pension, occupational pension, private pension, monthly savings, chosen stop age and pension start ages.
- The household shares the home, the mortgage and the expenses (now and after stopping). Stocks and funds can be per person, because the ISK tax-free allowance applies per person.
- Cash flow is simulated per month for the household: both incomes and both pensions in, shared expenses out, withdrawals from the liquid pool when needed.
- The bridge runs from the first person stopping until the last person's public pension starts; the checks (bridge covered, safety margin, money lasts to 100) apply to the household.
- Earliest stop age with two people: the earliest age for each person with the other's chosen age held fixed, shown as two rows (built as proposed).

## Model changes

Fixes and additions compared with draft 4:

1. **ISK tax.** Each year: capital base × (government borrowing rate + 1 pp, with the floor) × 30 %, after the tax-free allowance per person. The rate and allowance are parameters with today's values as defaults, checked against Skatteverket when built.
2. **Tax on pension payouts.** Public, occupational and private pension payouts are taxed as income: municipal tax rate (parameter), basic allowance including the higher allowance from the year one turns 66, and state income tax above the threshold. Values live in one constants file labelled with the tax year.
3. **Expenses today are actually used.** Draft 4 shows `expensesNow` but never uses it. It becomes a consistency check: net salary after tax − expenses − mortgage payment compared with the stated monthly savings, with a warning when they do not add up.
4. **Earliest public pension follows the target age system.** The lower bound for the public pension start is the current earliest withdrawal age, not a fixed 63.
5. Everything else from the draft's "simplifications" note stays, and the note is updated to say what is and is not modelled.

## Storage

- One scenario object in `localStorage`, versioned (`v: 1`) so the shape can change later.
- Export/import as a JSON file to move between devices, since there is no account.
- A "reset to example values" button. All `localStorage` access in try/catch; the app works without it.

## minPension

Signing in to minPension to fetch balances would save a lot of typing, but it is not doable here:

- minPension does deliver forecasts through an API, but to organisations such as Statens tjänstepensionsverk and Pensionsmyndigheten under agreements, not to individuals or hobby apps.
- Any sign-in flow (BankID) would need a server holding tokens and personal data, which breaks the "nothing stored" decision.

Instead, each pension field gets a short hint saying where on minpension.se the value is found. Revisit if minPension ever offers an export file or an open API for individuals.

## Build order

1. Scaffold the app from `apps/portfolio` (static Hono server, React/Vite client, own `tokens.css` with a signature colour, `Logo.tsx`, sv/en dictionaries). Next free dev ports: 3400 / 5210.
2. Port the draft-4 engine to `src/shared/` unchanged and write tests that pin its current results, so later changes show up as deliberate test updates.
3. Single-mode UI with `localStorage`, export/import and the shared chart.
4. Model changes 1–4, each with tests.
5. Duo mode.
6. Wiring: `Dockerfile`, CI matrix, `deploy/` (`compose.yml`, `.env.example`; not `backup.sh`, there is no data), README table.
7. Portfolio card, then the PR.

## Built

Built in [apps/brygga](../../apps/brygga). Choices made along the way:

- **Order.** The model (tax, savings check, pension floor, duo) was finished before the UI, so the page was built once against the final input shape. The pinning tests from step 2 still pass unchanged: with tax off and one person the engine gives draft 4's numbers exactly ([fixtures](../../apps/brygga/src/shared/fixtures/), produced by running the draft's own script).
- **Tax values** live in [tax.ts](../../apps/brygga/src/shared/tax.ts), labelled 2026 and checked against Skatteverket's *Belopp och procent 2026* and SKV 433 (grundavdrag, förhöjt grundavdrag, jobbskatteavdrag, skiktgräns 643 000, public service-avgift). Defaults: municipal rate 32,38 % (national average), statslåneränta 2,55 %, ISK allowance 300 000 per person. Thresholds and the ISK allowance are indexed with inflation (the allowance is nominal in law; indexing it is a simplification).
- **How tax runs.** Tax is withheld monthly at an estimated rate and settled at each year's end against the real yearly tax, like a final tax bill. ISK base = average of the four quarter values. Withdrawals take ISK first (tax-free), then private pension grossed up at the marginal rate. Left out: yield tax on private pension, job tax credit for those working past 66, guarantee pension, housing supplement.
- **Earliest public pension** is 64 (riktåldern 67 − 3, valid 2026–2030), one constant; older saved scenarios are clamped up to it.
- **Savings check** (model change 3) warns when net salary − expenses today − mortgage payment differs from the stated savings by more than 5 % of net salary (at least 1 000 kr). Expenses are explicitly *without* the mortgage. The example values were changed to 24 000 / 25 000 kr a month so they pass in single mode.
- **Duo cash flow.** While both work, the stated savings go in as in draft 4. Once one has stopped, the household lives on the working partner's net salary plus pensions, and the stated savings no longer apply. The bridge need is netted against the working partner's salary and any public pension already started (occupational pension still left out, as in the draft). Consequence: with a well-paid partner the earliest stop age can be very early, which means living on one salary.
- **UI.** Fjord-blue signature with a bridge mark; the shared `LineChart` gained vertical markers (`xLines`) and an option to drop end-of-line labels. On phones a summary of the result sits above the form.
