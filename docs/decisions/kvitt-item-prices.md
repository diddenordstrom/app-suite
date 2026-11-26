---
title: Kvitt: an optional price on list items
summary: Why a list item can carry a price per piece, how the total is counted from the quantity, and what was passed over
type: decision
status: accepted
updated: 2026-11-26
---

# Kvitt: an optional price on list items

Lists are also used to track gifts and other planned purchases, so an item can say what it cost.

## Decision

1. **One optional `price` per item, in minor units, per piece.** The column already existed (reserved for receipt scanning) and is now used, so there is no migration.
2. **The total is price × the leading number of the quantity.** Quantity stays free text ("5", "2 kg"); a missing or non-numeric quantity counts as 1. So "200 kr" alone is 200, and 5 × 100 kr is 500. The list shows "5 × 100 kr = 500 kr" and a sum at the bottom ("Totalt", with a note when some items have no price). See [`items.ts`](../../apps/kvitt/src/shared/items.ts).
3. **The price is in the household's currency**, entered like an expense amount (`123`, `123,5`). Prices are visible to everyone in the household, like the rest of a list.

## Passed over

- **A unit picker (st, kr, kg) instead of a plain quantity.** It would have made "200 kr" a quantity, but not 5 × 100 kr, and it turns the quantity into structured data the shopping flow does not need. A separate price field covers both cases with less UI.
- **Feeding prices into balances.** A price is a note on the list, not an expense; settling up still goes through the checkout and expense forms.

## Checkout

- **Prices prefill the checkout.** Each owner's amount starts as the sum of their checked items' totals, so a fully priced trip needs no typing. The amounts stay editable (the receipt rules).
- **The shopper can split on any active member**, not only the owners of the trip's lists, also when only their own lists are in the trip. "Delas med" shows a chip per member (tap to toggle) and adds a row per picked person; "Dela lika" re-splits after manual edits; each gets a debt to the shopper like a list owner does. Adding or removing a person re-splits the shopper's own share equally between the shopper and everyone added (one extra person is 50/50, two is thirds, any remainder öre stays with the shopper); other list owners keep their own amounts, and every amount stays editable. The server accepts any active member of the household as an allocation target.

## Redoing a split afterwards

- **A closed trip's split can be edited from History** (amounts, who it is split on), by the shopper or an admin (an admin may change anyone's). `PATCH /trips/:id`.
- **"Paid" means a later payment between the pair.** Balances are netted per pair and a trip has no paid flag of its own, so a trip is `locked` once a payment was registered, after the trip closed, between the shopper's wallet and the wallet of anyone it is split on. Then the split is read-only with a short note. See [`views.ts`](../../apps/kvitt/src/server/views.ts).
- **Passed over:** a per-trip "paid" checkbox. It would need its own settling flow next to the netted payments and could disagree with the balances.

## Guests on a trip

- **A trip can be split on anonymous guests**, at checkout and when redoing a split in History: a "Gäster" stepper (0–20) like the expense form. Adding a guest re-splits the shopper's own share equally between the shopper, the people picked and the guests.
- **A guest's share is stored on the trip** (`trips.guests`, `trips.guest_amount`, migration 0005), never as an allocation: it is not a debt and stays out of balances, like [guests on an expense](kvitt-bjudningar.md). The trip total counts it ("betalade 431,50 kr") and the summary says to ask them to Swish.

## Someone outside the app

- **An admin can add a member "utan app"** (Settings → Members): a normal member in splits and balances with no sign-in (`memberships.managed`, migration 0006). Because balances net per pair, what such a person owes builds up over every trip and expense by itself; the admin registers their payments as usual. A recovery link can still be created if they join later.
- **They are not preselected in new expenses**, so an equal split never drags them in by accident; trips and the "Delas med" chips list them like anyone.
- **Passed over:** named guests with their own running tab. It would duplicate the ledger; an anonymous guest ([above](#guests-on-a-trip)) stays for one-off heads, a member without the app for someone who keeps paying.
