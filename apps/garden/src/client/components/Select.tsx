/**
 * Listbox select: a button with role="combobox" that opens a list of role="option" items under it.
 * Used instead of a native <select> where the options need styling or tests pick them by role.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui";

export interface SelectOption<V extends string | number> { value: V; label: ReactNode; text?: string; disabled?: boolean }

export function useDismiss(open: boolean, close: () => void, root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close, root]);
}

export const listboxClass = "absolute left-0 right-0 top-full z-50 mt-1 max-h-60 min-w-40 overflow-auto rounded-md border border-border bg-card p-1 shadow-md";
export const optionClass = (active: boolean, selected = false) =>
  cn("flex w-full cursor-pointer select-none items-center rounded px-2 py-1.5 text-left text-sm", active && "bg-accent text-accent-foreground", selected && "font-semibold");

export function Select<V extends string | number>({ value, options, onChange, placeholder, id, className, triggerClassName, disabled, "aria-label": ariaLabel, "data-testid": testId }: {
  value: V | null | undefined;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  placeholder?: string;
  /** Goes on the trigger, so a <label htmlFor> names it. */
  id?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  useDismiss(open, () => setOpen(false), root);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: SelectOption<V>) => {
    if (o.disabled) return;
    setOpen(false);
    trigger.current?.focus();
    if (o.value !== value) onChange(o.value);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const o = options[active]; if (o) pick(o); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={cn("relative", className)} data-testid={testId}>
      <button
        ref={trigger}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", triggerClassName)}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div id={listId} role="listbox" className={listboxClass}>
          {options.map((o, i) => (
            <div
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              className={cn(optionClass(i === active, o.value === value), o.disabled && "opacity-50")}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
