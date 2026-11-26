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
