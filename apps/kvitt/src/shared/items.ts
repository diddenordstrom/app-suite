/**
 * Optional price on a list item (minor units, per piece). Quantity stays free text ("5", "2 l", "1 kg"), so the
 * count is its leading number and 1 when there is none: price 200 with no quantity is 200, 5 × 100 is 500.
 */

/** The leading number of a quantity ("5 st" -> 5, "2,5 kg" -> 2.5); 1 when blank or not a number. */
export function quantityCount(quantity: string | null | undefined): number {
  const m = /^\s*(\d+(?:[.,]\d+)?)/.exec(quantity ?? "");
  const n = m ? Number(m[1]!.replace(",", ".")) : 1;
  return n > 0 ? n : 1;
}

/** Price × count in minor units, or null when the item has no price. */
export function itemTotal(item: { price: number | null; quantity: string | null }): number | null {
  return item.price == null ? null : Math.round(item.price * quantityCount(item.quantity));
}

/** Sum of the priced items and how many of them have no price. */
export function listTotal(items: { price: number | null; quantity: string | null }[]): { total: number; priced: number; unpriced: number } {
  let total = 0;
  let priced = 0;
  for (const i of items) {
    const t = itemTotal(i);
    if (t == null) continue;
    total += t;
    priced++;
  }
  return { total, priced, unpriced: items.length - priced };
}
