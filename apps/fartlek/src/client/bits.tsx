import { Badge } from "./ui";
import type { MonthStatus, SessionOutcome, WeekStatus } from "@/shared/compliance";
import { gradeEasy } from "@/shared/zones";
import type { Block, Workout } from "@/shared/types";
import { fmtDuration } from "@/shared/format";
import { toDate } from "@/shared/dates";
import type { Countdown } from "@/shared/recovery";
import { locale, t, tn, type MsgKey } from "./i18n";

/* Small presentational pieces shared by pages. Status always has a label, never colour alone. */

export function StatusBadge({ status }: { status: WeekStatus | MonthStatus }) {
  const tone = status === "on_track" ? "success" : status === "behind" || status === "overreaching" ? "warning" : "neutral";
  return <Badge tone={tone}>{t(`status.${status}`)}</Badge>;
}

const OUTCOME_TONE: Record<SessionOutcome, "success" | "warning" | "neutral"> = {
  done: "success", short: "neutral", to_do: "neutral", missed: "neutral", skipped: "neutral", dropped: "neutral", upcoming: "neutral", rest: "neutral",
};

export function OutcomeBadge({ outcome }: { outcome: SessionOutcome }) {
  return <Badge tone={OUTCOME_TONE[outcome]}>{t(`outcome.${outcome}`)}</Badge>;
}

export function EasyBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const g = gradeEasy(score);
  return <Badge tone={g === "good" ? "success" : g === "ok" ? "warning" : "danger"} title={t("easy.title")}>{t("easy.badge", { pct: Math.round(score * 100) })}</Badge>;
}

export const TYPE_COLOR: Record<Workout["type"], string> = {
  easy: "var(--chart-3)", long: "var(--chart-1)", threshold: "var(--chart-2)", intervals: "var(--chart-5)",
  race: "var(--chart-4)", cross: "var(--muted-foreground)", strength: "var(--muted-foreground)", rest: "var(--border)",
};

/** Block kinds share the chart palette; the name or kind label is always shown too, never colour alone. */
export const BLOCK_COLOR: Record<Block["kind"], string> = {
  base: "var(--chart-3)", build: "var(--chart-1)", specific: "var(--chart-2)", taper: "var(--chart-4)", recovery: "var(--muted-foreground)",
};

export const blockName = (b: Pick<Block, "name" | "kind">) => b.name || t(`block.kind.${b.kind}`);

export function workoutText(w: Workout, dist: (km: number) => string): string {
  const parts = [w.type === "long" && w.zone2 ? t("workout.longEasy") : t(`workout.${w.type}`)];
  if (w.distanceKm != null) parts.push(dist(w.distanceKm));
  if (w.durationMin != null) parts.push(fmtDuration(w.durationMin * 60));
  return parts.join(" · ");
}

export function fmtDay(d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return toDate(d).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
}

export function fmtAgo(ms: number | null | undefined): string {
  if (!ms) return t("ago.never");
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t("ago.now");
  if (min < 60) return t("ago.min", { count: min });
  const h = Math.round(min / 60);
  if (h < 48) return t("ago.hours", { count: h });
  return tn("ago.days", Math.round(h / 24));
}

/** "in 1 week, 4 days" / "today". */
export function fmtCountdown(c: Countdown): string {
  if (c.days === 0) return t("countdown.today");
  if (c.days < 0) return t("countdown.done");
  const parts = [c.weeks ? tn("countdown.weeks", c.weeks) : "", c.restDays ? tn("countdown.days", c.restDays) : ""].filter(Boolean);
  return t("countdown.in", { time: parts.join(", ") });
}

/** A stored value (pain area, skip reason) in the user's language; unknown values show as-is. */
function label(prefix: string, v: string): string {
  const k = `${prefix}.${v}` as MsgKey;
  const s = t(k);
  return s === k ? v : s;
}
export const painArea = (a: string) => label("painArea", a);
export const skipReason = (r: string) => label("skip", r);

/** The two-arrow sync mark for "Synka" buttons. */
export function GearIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function SyncIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v3h3M4 13a8 8 0 0 0 14.5 4.5M20 20v-3h-3" />
    </svg>
  );
}
