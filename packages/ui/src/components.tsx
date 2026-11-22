import { useId, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./forms";
import { InfoTip } from "./InfoTip";
import { cn } from "./cn";

export type Variant = "primary" | "outline" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-primary hover:opacity-90",
  outline: "border border-card-edge bg-control shadow-control hover:bg-accent",
  ghost: "hover:bg-accent",
  danger: "bg-danger text-white shadow-control hover:opacity-90",
};

export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", variants[variant], className)}
      {...p}
    />
  );
}

export function Card({ className, horizon, ...p }: HTMLAttributes<HTMLDivElement> & { /** A thin dusk line along the top: for the page's one hero card. */ horizon?: boolean }) {
  // A clickable card lifts on hover, so the shadow hints that it can be pressed.
  return (
    <div className={cn("rounded-lg border border-card-edge bg-card p-4 shadow-card", p.onClick && "cursor-pointer transition-shadow hover:shadow-card-hover",
      horizon && "relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:[background:var(--horizon)]", className)} {...p} />
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn("h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring", className)} {...p} />;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "signature";
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  /** The app's own highlight colour: today, new, featured. */
  signature: "bg-signature-soft text-signature-foreground",
};

export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...p} />;
}

/** Button that shows a spinner and busy label while its action runs. */
export function BusyButton({ busy, busyLabel, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy: boolean; busyLabel?: string }) {
  return (
    <Button disabled={busy || p.disabled} {...p}>
      {busy ? <><Spinner />{busyLabel ?? "Working…"}</> : children}
    </Button>
  );
}

export function CardTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-2", className)}>
      <h2 className="text-sm font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Progress ring: the arc stops at 100 %, the centre keeps counting. With `segments` the arc is split
 * into parts in order (e.g. one per week), each in its own colour with a small gap between them;
 * their values should add up to `value`.
 */
export function Ring({ value, goal, size = 132, segments, children }: {
  value: number; goal: number | null; size?: number; segments?: { key: string; value: number; color: string }[]; children?: ReactNode;
}) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const gid = svgId(useId());
  const share = goal ? Math.min(value / goal, 1) : 0;
  const arc = (key: string, from: number, len: number, color: string, cap: "round" | "butt") => (
    <circle key={key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap={cap}
      strokeDasharray={`${len} ${c}`} strokeDashoffset={-from} />
  );
  const parts = segments?.filter((s) => s.value > 0) ?? [];
  let arcs: ReactNode = null;
  if (goal && share > 0) {
    if (parts.length < 2) arcs = arc("all", 0, c * share, parts[0]?.color ?? `url(#${gid})`, "round");
    else {
      const gap = 3;
      let at = 0;
      arcs = parts.map((s) => {
        const len = Math.min(c * (s.value / goal), c * share - at);
        const node = len > gap ? arc(s.key, at, len - gap, s.color, "butt") : null;
        at += Math.max(len, 0);
        return node;
      });
    }
  }
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        {/* The svg is turned a quarter, so a top-to-bottom gradient runs left to right on screen. */}
        <defs><HorizonGradient id={gid} x2="0" y2="1" /></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={10} />
        {arcs}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** A labelled number. `info` adds an ⓘ after the label with a one- or two-sentence explanation. */
export function Stat({ label, value, sub, tone, info }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warning"; info?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{label}{info && <InfoTip label={label}>{info}</InfoTip>}</div>
      <div className={cn("font-display text-2xl leading-tight font-medium tabular-nums", tone === "warning" && "text-warning")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** useId() gives ids like ":r1:", which break inside url(#…). */
export const svgId = (id: string) => `h${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

/** The horizon (skymning.css) as an SVG gradient: lavender into `to`, the app's signature by default. */
export function HorizonGradient({ id, to = "var(--horizon-end)", x2 = "1", y2 = "1" }: { id: string; to?: string; x2?: string; y2?: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0" style={{ stopColor: "var(--brand)" }} />
      <stop offset="1" style={{ stopColor: to }} />
    </linearGradient>
  );
}

/** The tile behind every app mark: the horizon from top left to bottom right. Draw the mark on top. */
export function MarkTile({ rx = 9, accent }: { rx?: number; /** The app's signature; defaults to the current app's. */ accent?: string }) {
  const id = svgId(useId());
  return (
    <>
      <defs><HorizonGradient id={id} to={accent ? `color-mix(in oklab, ${accent} 78%, var(--brand))` : undefined} /></defs>
      <rect width="32" height="32" rx={rx} fill={`url(#${id})`} />
    </>
  );
}
