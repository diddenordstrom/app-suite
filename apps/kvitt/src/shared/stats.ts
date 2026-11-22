/**
 * Pure spending statistics over StatsEntry rows (D41). Amounts are minor units.
 * "Household" = the full cost of every trip and expense; "mine" = the viewer's share of it.
 */
import type { StatsEntry } from "./api";

export type StatsRange = "3m" | "12m" | "all";

export interface MonthStat { month: string; total: number; mine: number }
export interface GroupStat { kind: StatsEntry["kind"]; label: string | null; total: number; mine: number; count: number }
export interface Stats {
  months: MonthStat[]; // contiguous, oldest first, zero-filled
  groups: GroupStat[]; // largest first
  members: { memberId: number; amount: number }[]; // each member's share, largest first
  total: number;
  mine: number;
}

/** "YYYY-MM" in local time. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function entryMonth(e: Pick<StatsEntry, "date" | "at">): string {
  return e.date ? e.date.slice(0, 7) : monthKey(new Date(e.at));
}

/** Month keys from `first` to `last` inclusive. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export function buildStats(entries: StatsEntry[], meId: number, range: StatsRange, now = new Date()): Stats {
  const last = monthKey(now);
  const back = range === "3m" ? 2 : range === "12m" ? 11 : null;
  const first = back === null
    ? entries.map(entryMonth).reduce((a, b) => (b < a ? b : a), last)
    : monthKey(new Date(now.getFullYear(), now.getMonth() - back, 1));

  const months = new Map(monthsBetween(first, last).map((m) => [m, { month: m, total: 0, mine: 0 }]));
  const groups = new Map<string, GroupStat>();
  const members = new Map<number, number>();
  let total = 0, mine = 0;

  for (const e of entries) {
    const month = months.get(entryMonth(e));
    if (!month) continue; // outside the range (or in the future)
    const my = e.shares.filter((s) => s.memberId === meId).reduce((a, s) => a + s.amount, 0);
    month.total += e.total; month.mine += my;
    total += e.total; mine += my;
    const label = e.label?.trim() || null;
    const key = `${e.kind}:${label?.toLocaleLowerCase() ?? ""}`;
    const g = groups.get(key) ?? { kind: e.kind, label, total: 0, mine: 0, count: 0 };
    g.total += e.total; g.mine += my; g.count++;
    groups.set(key, g);
    for (const s of e.shares) members.set(s.memberId, (members.get(s.memberId) ?? 0) + s.amount);
  }

  return {
    months: [...months.values()],
    groups: [...groups.values()].sort((a, b) => b.total - a.total || (a.label ?? "").localeCompare(b.label ?? "")),
    members: [...members].map(([memberId, amount]) => ({ memberId, amount })).filter((m) => m.amount > 0)
      .sort((a, b) => b.amount - a.amount || a.memberId - b.memberId),
    total, mine,
  };
}
