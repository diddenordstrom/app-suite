import type { ButtonHTMLAttributes, ComponentProps, HTMLAttributes, ReactNode } from "react";
import { Spinner } from "./forms";
import { InfoTip } from "./InfoTip";
import { cn } from "./cn";

export type Variant = "primary" | "outline" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border border-border bg-background hover:bg-accent",
  ghost: "hover:bg-accent",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", variants[variant], className)}
      {...p}
    />
  );
}

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card p-4", className)} {...p} />;
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
  const share = goal ? Math.min(value / goal, 1) : 0;
  const arc = (key: string, from: number, len: number, color: string, cap: "round" | "butt") => (
    <circle key={key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap={cap}
      strokeDasharray={`${len} ${c}`} strokeDashoffset={-from} />
  );
  const parts = segments?.filter((s) => s.value > 0) ?? [];
  let arcs: ReactNode = null;
  if (goal && share > 0) {
    if (parts.length < 2) arcs = arc("all", 0, c * share, parts[0]?.color ?? "var(--signature)", "round");
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
      <div className={cn("text-lg font-semibold tabular-nums", tone === "warning" && "text-warning")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
