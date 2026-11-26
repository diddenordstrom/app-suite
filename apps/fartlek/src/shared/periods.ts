/**
 * The Statistik page's period picker (docs/decisions/fartlek-period-stats.md): a choice and today
 * become period A (the chosen one) and period B (what it is compared with).
 *
 * Equal length: both sides always cover the same number of days, so a difference is not just a
 * longer period. An ongoing week, month or block is compared with as many days from the start of
 * the one before; full periods of different lengths (months, blocks) compare their first N days,
 * N being the shorter; a custom range is compared with as many days directly before it.
 */
import { addDays, addMonths, daysBetween, monthEnd, monthStart, weekNumber, weekStartOf, type ISODate, type WeekStart } from "./dates";
import type { Period } from "./periodstats";
import type { Msg } from "./types";

export const PRESETS = ["today", "week", "lastWeek", "month", "lastMonth", "block", "lastBlock", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

/** What the user picked: a preset pill, a custom range, or a week or block on the timeline. */
export type Choice =
  | { kind: "preset"; preset: Exclude<Preset, "custom"> }
  | { kind: "custom"; from: ISODate; to: ISODate }
  | { kind: "week"; weekStart: ISODate }
  | { kind: "block"; id: number };

export interface PeriodBlock { id: number; name: string; startWeek: ISODate; weeks: number }

/** How to name a side; the client renders it in the current language. */
export type PeriodLabel =
  | { kind: "day"; date: ISODate }
  | { kind: "week"; week: number }
  | { kind: "month"; month: ISODate }
  | { kind: "block"; name: string }
  | { kind: "range"; from: ISODate; to: ISODate };

export interface Comparison {
  a: Period;
  b: Period;
  labelA: PeriodLabel;
  labelB: PeriodLabel;
  /** The equal-length rule as it applied to this choice. */
  note: Msg;
  /** Days on each side. */
  days: number;
}

export interface PeriodContext { today: ISODate; weekStart?: WeekStart; blocks?: PeriodBlock[] }

const len = (p: Period) => daysBetween(p.from, p.to) + 1;
const span = (from: ISODate, days: number): Period => ({ from, to: addDays(from, days - 1) });
const blockEndOf = (b: PeriodBlock) => addDays(b.startWeek, b.weeks * 7 - 1);
const msg = (key: string, params?: Msg["params"]): Msg => (params ? { key, params } : { key });

/** The same number of days directly before `a`. */
function before(a: Period): Period {
  const n = len(a);
  return { from: addDays(a.from, -n), to: addDays(a.from, -1) };
}

function week(ws: ISODate, today: ISODate, picked: boolean): Comparison | null {
  if (ws > today) return null;
  const n = Math.min(7, daysBetween(ws, today) + 1);
  const prev = addDays(ws, -7);
  return {
    a: span(ws, n), b: span(prev, n),
    labelA: { kind: "week", week: weekNumber(ws) }, labelB: { kind: "week", week: weekNumber(prev) },
    note: n < 7 ? msg("stats.note.weekOngoing", { week: weekNumber(ws), count: n }) : msg(picked ? "stats.note.pickedWeek" : "stats.note.fullWeeks"),
    days: n,
  };
}

function month(ms: ISODate, today: ISODate): Comparison | null {
  if (ms > today) return null;
  const end = monthEnd(ms);
  const ongoing = end > today;
  const n = daysBetween(ms, ongoing ? today : end) + 1;
  const prev = addMonths(ms, -1);
  const m = Math.min(n, daysBetween(prev, monthEnd(prev)) + 1);
  const note = ongoing ? msg("stats.note.monthOngoing", { count: m })
    : m === n && n === daysBetween(prev, monthEnd(prev)) + 1 ? msg("stats.note.fullMonths", { count: m })
    : msg("stats.note.unevenMonths", { count: m });
  return { a: span(ms, m), b: span(prev, m), labelA: { kind: "month", month: ms }, labelB: { kind: "month", month: prev }, note, days: m };
}

function sortedBlocks(ctx: PeriodContext) {
  return [...(ctx.blocks ?? [])].sort((x, y) => x.startWeek.localeCompare(y.startWeek));
}
/** The block before `b` (the latest that ends before it starts). */
function prevBlock(b: PeriodBlock, blocks: PeriodBlock[]) {
  return blocks.filter((x) => blockEndOf(x) < b.startWeek).at(-1) ?? null;
}
function currentBlock(ctx: PeriodContext) {
  return sortedBlocks(ctx).find((b) => b.startWeek <= ctx.today && blockEndOf(b) >= ctx.today) ?? null;
}
function lastBlock(ctx: PeriodContext) {
  const blocks = sortedBlocks(ctx);
  const cur = currentBlock(ctx);
  return cur ? prevBlock(cur, blocks) : blocks.filter((b) => blockEndOf(b) < ctx.today).at(-1) ?? null;
}

function block(blk: PeriodBlock, ctx: PeriodContext): Comparison | null {
  const { today } = ctx;
  if (blk.startWeek > today) return null;
  const total = blk.weeks * 7;
  const ongoing = blockEndOf(blk) > today;
  const n = ongoing ? daysBetween(blk.startWeek, today) + 1 : total;
  const prev = prevBlock(blk, sortedBlocks(ctx));
  if (!prev) {
    const a = span(blk.startWeek, n);
    return { a, b: before(a), labelA: { kind: "block", name: blk.name }, labelB: { kind: "range", ...before(a) }, note: msg("stats.note.blockNoPrev"), days: n };
  }
  const m = Math.min(n, prev.weeks * 7);
  const note = ongoing ? msg("stats.note.blockOngoing", { name: blk.name, day: n, total, count: m, prev: prev.name })
    : m === n && m === prev.weeks * 7 ? msg("stats.note.fullBlocks", { count: m })
    : msg("stats.note.unevenBlocks", { count: m });
  return { a: span(blk.startWeek, m), b: span(prev.startWeek, m), labelA: { kind: "block", name: blk.name }, labelB: { kind: "block", name: prev.name }, note, days: m };
}

/** Whether a preset pill can be chosen today (the block presets need a block). */
export function presetAvailable(preset: Preset, ctx: PeriodContext): boolean {
  if (preset === "block") return !!currentBlock(ctx);
  if (preset === "lastBlock") return !!lastBlock(ctx);
  return true;
}

/** Periods A and B for a choice; null when the choice does not resolve (a block that is gone, a future week). */
export function comparePeriods(choice: Choice, ctx: PeriodContext): Comparison | null {
  const { today } = ctx;
  const ws = weekStartOf(today, ctx.weekStart ?? "monday");
  switch (choice.kind) {
    case "custom": {
      const [from, to] = choice.from <= choice.to ? [choice.from, choice.to] : [choice.to, choice.from];
      const a = { from, to };
      return { a, b: before(a), labelA: { kind: "range", from, to }, labelB: { kind: "range", ...before(a) }, note: msg("stats.note.custom", { count: len(a) }), days: len(a) };
    }
    case "week": return week(choice.weekStart, today, true);
    case "block": {
      const b = (ctx.blocks ?? []).find((x) => x.id === choice.id);
      return b ? block(b, ctx) : null;
    }
    case "preset":
      switch (choice.preset) {
        case "today": {
          const b = addDays(today, -7);
          return { a: { from: today, to: today }, b: { from: b, to: b }, labelA: { kind: "day", date: today }, labelB: { kind: "day", date: b }, note: msg("stats.note.today"), days: 1 };
        }
        case "week": return week(ws, today, false);
        case "lastWeek": return week(addDays(ws, -7), today, false);
        case "month": return month(monthStart(today), today);
        case "lastMonth": return month(addMonths(today, -1), today);
        case "block": {
          const cur = currentBlock(ctx);
          return cur ? block(cur, ctx) : null;
        }
        case "lastBlock": {
          const last = lastBlock(ctx);
          return last ? block(last, ctx) : null;
        }
      }
  }
}
