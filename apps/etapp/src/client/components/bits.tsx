/** Small planner building blocks: the brown road-sign number, link/toggle chips, the category tag. */
import { useState, type ComponentProps, type ReactNode } from "react";
import { parseLatLon } from "@/shared/geo";
import type { Category } from "@/shared/plan";
import { cn, Input } from "../ui";
import { t } from "../i18n";

/** Brown Norwegian tourist-road sign with a light inner rule: the one place Etapp leaves the suite palette. */
export function Sign({ children, wide, label, className }: { children: ReactNode; wide?: boolean; label?: string; className?: string }) {
  return (
    <div
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "flex shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] bg-sign font-sign font-bold tabular-nums text-sign-foreground outline-2 -outline-offset-4 outline-sign-foreground",
        wide ? "h-10 min-w-16 px-3 text-xl uppercase tracking-wide" : "h-9 min-w-11 px-2 text-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

const chip = "inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition hover:border-primary";

export function ChipLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className={chip} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function ChipButton({ pressed, onClick, children }: { pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cn(chip, pressed && "border-primary bg-accent")} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export function Chips({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>;
}

const catColor: Record<Category, string> = {
  fika: "var(--chart-3)", mat: "var(--chart-5)", sova: "var(--tent)", se: "var(--chart-1)", fixa: "var(--muted-foreground)",
};

export function CategoryTag({ category }: { category: Category }) {
  return (
    <span className="inline-flex min-w-16 shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <i className="inline-block size-2.5 rounded-[2px]" style={{ background: catColor[category] }} />
      {t(`cat.${category}`)}
    </span>
  );
}

/** Small uppercase label above a group. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}>{children}</p>;
}

/** "61.8, 8.5" → position, "" → none, anything else → error. */
export function readPosition(text: string): { lat: number | null; lon: number | null } | "invalid" {
  if (!text.trim()) return { lat: null, lon: null };
  return parseLatLon(text) ?? "invalid";
}

/**
 * A text field that saves itself: on blur (or Enter) when the value changed. No Save button. When another traveller
 * changes the value on the server, the field follows it unless you are typing in it.
 */
export function AutoInput({ value, onSave, className, ...p }: { value: string; onSave: (v: string) => void } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  const [focused, setFocused] = useState(false);
  if (value !== seen && !focused) { setSeen(value); setV(value); }
  const commit = () => { if (v.trim() !== value) onSave(v.trim()); };
  return (
    <Input
      {...p} className={className} value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}
