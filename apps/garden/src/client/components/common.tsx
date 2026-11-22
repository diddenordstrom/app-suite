/** Small building blocks the garden pages share, on top of @homelab/ui. */
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, Input, cn } from "../ui";

export function PageTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}

export function SectionTitle({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return <h2 id={id} className={cn("mb-3 text-lg font-semibold tracking-tight", className)}>{children}</h2>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function PlusCircle() {
  return (
    <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-signature-soft">
      <svg className="size-6 text-signature-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    </div>
  );
}

/** Dashed card for "nothing here yet"; with `to` the whole card links to where you add the first one. */
export function EmptyState({ title, description, to }: { title: ReactNode; description?: ReactNode; to?: string }) {
  const body = (
    <Card className={cn("flex flex-col items-center justify-center border-dashed px-6 py-12 text-center", to && "hover:border-primary")}>
      <PlusCircle />
      <h2 className="mb-1 font-semibold">{title}</h2>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
    </Card>
  );
  return to ? <Link to={to} data-testid="empty-state-cta" className="block transition hover:opacity-90">{body}</Link> : body;
}

export function SearchInput({ className, ...p }: ComponentProps<"input">) {
  return (
    <div className={cn("relative", className)}>
      <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z" />
      </svg>
      <Input type="search" className="pl-9" {...p} />
    </div>
  );
}

/** A filter chip: outlined, filled when on. */
export function Chip({ on, className, ...p }: ComponentProps<"button"> & { on: boolean }) {
  return (
    <button type="button" aria-pressed={on}
      className={cn("inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm font-medium transition", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent", className)}
      {...p} />
  );
}

/** A number input with a unit suffix inside it. */
export function UnitInput({ unit, className, ...p }: ComponentProps<"input"> & { unit: string }) {
  const pad = unit.length <= 2 ? "pr-10" : unit.length <= 4 ? "pr-14" : "pr-20";
  return (
    <div className="relative">
      <Input className={cn(pad, className)} {...p} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}

export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium", className)} {...p} />;
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px bg-border", className)} />;
}

/** Small round or pill tag. */
export function Pill({ className, ...p }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground", className)} {...p} />;
}

/** A row label + value, used in detail cards. */
export function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-3", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}

export function PlusIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

/** A form-level error box (role="alert"). Renders nothing without a message. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{children}</div>;
}

export function TrashIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
