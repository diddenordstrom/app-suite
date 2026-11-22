---
title: "Kvitt: plånböcker and bilutgifter for trips with friends"
summary: How a couple counts as one in balances (plånbok), and how the car calculator in the expense form works, with what was passed over
type: decision
status: accepted
updated: 2026-11-22
---

# Kvitt: plånböcker and bilutgifter

Worked out from a made-up ski trip: two couples and two singles, two cars, a vegetarian, two sober people. Most of it Kvitt already handled (subsets of participants, shares, the payer can be left out of a split, so "Jonna buys snacks only for Max" and "the passengers pay for the fuel" already work). Two gaps were worth building. Mockups: the "Kvitt – Bilutgift mock" Claude Design canvas (variants A, B, C; B was chosen).

## Plånbok (shared wallet)

1. **A member can join another member's wallet** (`memberships.wallet_id` → the lead). Couples with joint finances are the case: Didde & Sambon count as one in balances and never owe each other.
2. **Only money merges.** Expenses, shares, trips and stats stay per person (who ate what is still visible). In `/balances` every debt is moved onto the wallet's lead and debts inside a wallet disappear (`mergeWallets` in [`balances.ts`](../../apps/kvitt/src/shared/balances.ts)), before netting, the green zone and the simplified settlement. The lead receives and sends the Swish; the Swish nudge only asks the lead for a number.
3. **Computed, never stored.** Joining mid-trip also merges what happened before; leaving restores the per-person view. Nothing is rewritten.
4. **Rules:** no joining yourself, no chains (a lead is never in another wallet, and someone others have joined can't join elsewhere until they leave), members change only their own wallet, admins anyone's. Removing a member takes them out of any wallet and dissolves theirs.
5. **UI:** a "Plånböcker" section in settings (one select per member: "Egen plånbok" / "Med Didde") and the wallet name "Didde & Sambon" wherever balances and settling show a person.

## Bilutgift (car calculator)

1. **Part of the ordinary expense form** (variant B), not its own form or a car register: a "Räkna ut bilkostnad" button opens a small calculator that fills in the amount. Splitting stays the normal split, so wallets, shares and guests all just work.
2. **Two modes:** fuel (mil × l/mil × kr/l) or a rate per mil (milersättning), with a round-trip switch. The amount is rounded to whole kronor.
3. **The driver starts unticked** on a new car expense (passengers pay for the drive, the most common deal) and follows the payer if it changes; ticking the driver back in shares it with them too.
4. **Prefill:** the driver's last car expense supplies mode, consumption, fuel price and rate (`GET /car/:driverId`). The distance is always typed.
5. **Tankningar already logged are offered as deductions**, never applied silently: the driver's recent (60 days) expenses whose title looks like fuel (`looksLikeFuel` in [`car.ts`](../../apps/kvitt/src/shared/car.ts)) and that no other car expense has deducted. Ticking one subtracts it, so someone who filled up on the way isn't paid twice. This lets a driver log a tankning during the trip to avoid being out of pocket and settle the rest by distance at home.
6. **The calculation is stored** on the expense (`expenses.car`, JSON) so it can be reopened and edited; the amount is still what the ledger uses.

## Passed over

- **A separate car form (A):** the same as B with more UI to maintain.
- **Cars registered per group (C):** fastest per drive, but the group logs one or two drives per trip (out and home), so the setup doesn't pay off. Can be added on top of B later.
- **A fuel category:** categories are five fixed slots; a title match plus explicit ticking is enough.
- **Line items inside one expense** ("300 kr of this receipt is only for Jonna"): still two expenses. Open idea.
- **Currency per expense:** still one currency per household. Open idea for trips abroad.
- **Wallets for separate finances at home:** the owner's household has joint finances, so recurring costs and income-based default splits were left out.

## Data

Migration `0004_wallets_car`: `memberships.wallet_id integer references memberships(id)` and `expenses.car text`. No backfill; both start empty.
