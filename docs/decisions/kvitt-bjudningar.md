---
title: Kvitt: bjudningar, gäster och en grön zon
summary: How treats (bjudningar) stay out of the ledger, how an anonymous guest and a green zone work, the data and API changes, and build order
type: decision
status: accepted
updated: 2026-11-10
---

# Kvitt: bjudningar, gäster och en grön zon

Designed around a group of friends who like to treat each other, hate settling up back and forth, and still want it fair over time. Mockups were drawn in Swedish UI, Skymning light mode.

## Decision

1. **A bjudning never creates a debt.** An expense is either *bjudet* (`gift`) or *delas* (shared, as today). A gift stays out of balances and stats. Its amount is optional (nobody prices a pork fillet from the freezer).
2. **The scoreboard is a quiet log, not a ranking.** The "Bjudningar" tab next to "Saldo" lists treats by month ("Didde bjöd på hemlagat"), with a category dot per row. Under the month heading it shows when each person *last* treated, always in alphabetical order. No counts per person, no sorting, no "least treated": how often someone can host says nothing about fairness.
3. **A gentle hint to host.** When nobody has treated for `hintMonths` months (setting, minimum 1, default 1) a calm line says so ("Det var ett tag sedan någon bjöd hem"). It points at the group, never at a person, never shows before the first logged bjudning, and can be switched off.
4. **Bjudet or delas is chosen per expense, with a default per category.** Categories are five fixed chips: Hemma, Dryck, Restaurang, Aktivitet, Annat. Only Hemma is bjudet by default; the rest are delas (a round of drinks is usually split). The defaults are editable in settings. Households can *rename* the five slots (admins, 24 characters) but not add or remove any; an empty name falls back to the translated default. Hemlagat and Hemmafest are merged into Hemma, and Fika is gone as its own category (it is Annat or a renamed slot). See "Category slots" below.
5. **One anonymous guest slot.** A stepper "Gäster" adds N unnamed heads to an *equal* split (4 members + 1 guest = split by 5). Guests need no account. The guest's share never enters the ledger; the payer sees "Gäst: 100 kr. Be hen swisha dig." Guests are only offered for equal splits, not shares or exact.
6. **A green zone, entered in whole kronor** (default ±100 kr, household setting). It is a *display rule on each person's net total*, not a rebate: balances are never reset, so 99 kr owed plus 50 kr more is 149 kr.
   - Everyone inside the zone (|net| ≤ zone): "Ni är kvitt", nets shown in muted text.
   - Someone outside: show the simplified settlement, and mark a payment **kan vänta** when everyone still ends up inside the zone without it. (Not simply "payments smaller than the zone": paying 200 of a 320 debt leaves 120, still outside.)

## Reasons

- Treating is part of the group's culture; the app should record it, not price it. Keeping gifts out of the money maths means the ledger semantics ([`balances.ts`](../../apps/kvitt/src/shared/balances.ts)) stay untouched and the existing tests keep their meaning.
- A ranking or "least treated" nudge turns generosity into a score and punishes people with less money. Last-treated dates give the hint without comparing anyone.
- A zone on top of an exact ledger keeps the books honest while removing the Swish ping-pong; zeroing small balances would make debts disappear and drift.
- Whole kronor in the UI: the group does not need öre precision in settings. Storage stays integer minor units (zone × 100 when compared).

## Passed over

- **Calendar view** of treats: more visual, less useful.
- **Per-person cards with counts** (variant B): reads as a pick-me leaderboard.
- **Zeroing or forgiving balances inside the zone:** loses debts silently.
- **Named guests / guest accounts:** the group wants one nameless slot ("gäst 1, gäst 2" at worst).
- **Guests on shares/exact splits:** unclear meaning; equal covers the use case.
- **Estimating a value for treats** so they count against the zone: rejected, gifts stay unpriced.

## Data

Migration `0002_bjudningar` (next after [0001](../../apps/kvitt/drizzle/0001_archive_empty_lists.sql)):

- `expenses.gift integer not null default 0`, `expenses.guests integer not null default 0`, `expenses.guest_amount integer not null default 0` (computed at write time, like `expense_shares.amount`). `expenses.amount` stays `not null`; a gift without a price stores 0.
- Gifts keep `expense_shares` rows for who was there (weight 1, amount 0), so history can show attendees. `expenseDebts` already ignores amount 0.
- `households.zone_kr integer not null default 100`, `households.gift_categories text not null` (JSON array of category keys, default the four above), `households.hint_enabled integer not null default 1`, `households.hint_months integer not null default 1`.
- No scoreboard table: it is derived from gift expenses.
- Categories: a fixed set of keys in [`gifts.ts`](../../apps/kvitt/src/shared/gifts.ts), `Annat` keeps a free-text note. Existing free-text categories stay as they are and show as before.

## Category slots

Migration `0003_category_slots` adds `households.category_labels text not null default '{}'` (JSON map key → own name) and remaps old data: `homecooked`/`houseparty` → `home`, `round` → `drinks`, `fika` → `other`, in both `expenses.category` and each household's `gift_categories`; households still on the old default move to `["home"]`. The column default of `gift_categories` stays at the old value (changing a SQLite default means a table rebuild with cascades); new households get `DEFAULT_GIFT_CATEGORIES` from code instead. Free-text categories are left alone, which answers the earlier open question about mapping them.

The client's persisted query cache is now versioned (`CACHE_VERSION` in `api.ts`): a new build rendered old cached `/balances` and household responses (no `plan`, no `settings`) and crashed before the refetch. Bump it whenever a cached response changes shape.

## Logic (`apps/kvitt/src/shared/balances.ts`, pure and tested)

- `splitAmount` is reused for guests: give guests synthetic member ids larger than any real id, so rounding remainders (ascending id) land on real members, then drop the guest rows and store their sum as `guest_amount`.
- New `settlementPlan(totals, zoneMinor)`: from `memberTotals`/`simplifyDebts` it returns `{ inside: boolean, outside: memberId[], payments: [{ from, to, amount, optional }] }`. A payment is `optional` if removing it (together with the ones already marked optional, smallest first, ties by id) leaves every net inside the zone. Greedy and deterministic, fine for a handful of people.
- Hint and "senast" are plain helpers over gift dates (`lastGiftByMember`, `hintDue(lastGiftDate, today, months)`), month arithmetic on calendar months.
- Shared logic returns message keys + params, not text (repo rule).

## API (`apps/kvitt/src/server/routes`)

- `money.ts` `parseExpense`: accept `gift` (boolean) and `guests` (int 0–20, equal split only); `amount` min 0 when `gift`, min 1 otherwise; for gifts, participants are the attendees and the payer is the host. `/balances` and `/stats` skip gift expenses; `/activity` keeps them, labelled as bjudet.
- `/balances` response gains `totals` (net per member), `zone` and `plan` from `settlementPlan`; `pairs`/`simplified` stay for compatibility until the client moves over.
- New `GET /gifts` (newest first, `lastByMember`, `hint: boolean`), so the client does not fetch every expense.
- `households.ts` `PATCH /`: add `zoneKr`, `giftCategories`, `hintEnabled`, `hintMonths` (admin only, like name and currency; `hintMonths` ≥ 1, `zoneKr` ≥ 0). Types in `shared/api.ts`.

## Client

- `ExpenseForm`: kategori chips first, then a Bjudet/Delas switch preselected from the category default, guests stepper (equal split only), the guest note, optional amount and "Vilka var där?" for bjudet.
- `Balances`: "Saldo" / "Bjudningar" tabs; status card ("Ni är kvitt" or "Dags att göra upp lite"), nets per person, payments with "kan vänta".
- `Settings`: zone (kr), category defaults, hint on/off and months (stepper, never below 1).
- Every string through `t()` in `en` and `sv`; reuse keys from `packages/i18n/src/shared.ts` first. Colours from tokens only (signature green, `light-dark()`, AA in both modes).
- Demo mode ([demo-mode](demo-mode.md)) seed gets a couple of bjudningar and one guest expense.

## Build order

1. Migration + schema + `balances.ts` (`settlementPlan`, guest split, hint helpers) with tests, including: 99 kr + 50 kr = 149 kr, the 320/200/60/60 case, guest remainder, gift producing no debts.
2. Routes and shared types, `app.test.ts` cases, `migrations.test.ts`.
3. Settings, expense form, then Balances and the bjudningar tab.
4. i18n, demo seed, `npm run check`.

## Built

All four steps are implemented on `feat/kvitt-bjudningar`. Differences from the plan above:

- Balances no longer has the simplified/all toggle: the plan's payments are the simplified view, and "Alla skulder" (the pair list) sits in a collapsed section.
- `expense.amount` for a gift is 0 when unpriced, and the activity feed and history hide an amount of 0.
- History's "you lent" delta ignores gifts and excludes the guest's share (it is asked for outside the app).
- Gift attendees exclude the host; a gift needs no attendees (no share rows then).
- Not yet verified visually in a browser; only typecheck, lint and tests.

## Open questions

- **Who may change the zone and defaults:** settled for now as admins only (like name and currency); members see the values read-only.
- **Whether to show a received-treat count** at all: not wanted for now.
- **Editing an expense from delas to bjudet** after balances were settled: allowed, but the debt disappears; maybe note it in the activity feed.
