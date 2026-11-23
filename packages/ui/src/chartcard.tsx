import type { ReactNode } from "react";
import { Badge, Card, type BadgeTone } from "./components";
import { InfoTip } from "./InfoTip";
import { cn } from "./cn";

type Ink = "success" | "warning" | "danger";
const INK: Record<Ink, string> = { success: "text-success", warning: "text-warning", danger: "text-danger" };

/** The big number at the top of a chart card: what the chart says today. */
export interface ChartHeadline {
  /** Small label above the number ("Form idag"); leave out when the title already says it. */
  label?: string;
  value: ReactNode;
  /** Muted unit beside the number ("km", "/km"). */
  unit?: string;
  /** Colour only when there is something to watch; holding up stays neutral. */
  tone?: Ink;
  /** A word for the state ("tappar mycket"), right of the number. */
  badge?: { label: string; tone?: BadgeTone };
  /** One line of context under the badge: a date or a change ("senaste passet · 20 sep."). */
  context?: ReactNode;
  /** 0–1: a thin bar under the number (this week against its plan). */
  progress?: number;
}

/** A key number under the chart: something the chart doesn't say at a glance. */
export interface KeyStat {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Ink;
}

/**
 * One chart card shape for every trend: title with ⓘ and a one-line sub, today's value, the chart,
 * then two or three key numbers. Everything but the title and the chart is optional.
 */
export function ChartCard({ title, info, sub, action, headline, stats, className, children, ...rest }: {
  title: string;
  /** How to read the chart; the long explanation lives here, not in `sub`. */
  info?: ReactNode;
  sub?: ReactNode;
  /** Right side of the title row (a pill switch). */
  action?: ReactNode;
  headline?: ChartHeadline;
  stats?: KeyStat[];
  className?: string;
  children: ReactNode;
  "data-tour"?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-4", className)} {...rest}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1 text-sm font-semibold">{title}{info && <InfoTip label={title}>{info}</InfoTip>}</h2>
          {action}
        </div>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {headline && <Headline {...headline} />}
      <div>{children}</div>
      {stats && stats.length > 0 && (
        <div className={cn("grid gap-3 border-t border-border pt-3", stats.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <div className="truncate text-xs text-muted-foreground">{s.label}</div>
              <div className={cn("text-lg leading-snug font-semibold tabular-nums", s.tone && INK[s.tone])}>{s.value}</div>
              {s.sub && <div className="truncate text-xs text-muted-foreground">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Headline({ label, value, unit, tone, badge, context, progress }: ChartHeadline) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {label && <div className="mb-1 text-xs text-muted-foreground">{label}</div>}
          <div className={cn("font-display text-5xl leading-none font-medium tabular-nums", tone && INK[tone])}>
            {value}{unit && <span className="ml-1 font-sans text-lg font-normal text-muted-foreground">{unit}</span>}
          </div>
        </div>
        {(badge || context) && (
          <div className="flex shrink-0 flex-col items-end gap-1.5 pb-0.5 text-right">
            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
            {context && <div className="text-xs text-muted-foreground">{context}</div>}
          </div>
        )}
      </div>
      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className="h-full rounded-full bg-signature" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
