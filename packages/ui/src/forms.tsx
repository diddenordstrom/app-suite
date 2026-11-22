import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { tShared } from "@homelab/i18n";

const field = "w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-20 py-2", className)} {...p} />;
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-10", className)} {...p} />;
}

/** Label + control + optional hint. */
export function Field({ label, hint, className, children }: { label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function IconButton({ className, label, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", className)}
      {...p}
    />
  );
}

export function SegmentedControl<T extends string>({ value, options, onChange, className, "aria-label": ariaLabel }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string; "aria-label"?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-md bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex-1 whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium transition", value === o.value ? "bg-control text-foreground shadow-control" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="whitespace-pre-line text-sm text-danger">{children}</p>;
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-label={tShared("common.loading")} className={cn("inline-block size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent", className)} />;
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
