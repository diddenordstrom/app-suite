/**
 * Searchable single-select: an input with role="combobox" that filters a list of options as you type
 * (accents ignored). Enter picks the first match, or, once something is picked, submits (`onSubmit`).
 */
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "../ui";
import { t } from "../i18n";
import { listboxClass, optionClass, useDismiss } from "./Select";

export interface ComboOption { id: number; name: string }

export const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Combobox({ value, options, onChange, onSubmit, placeholder, clearable, disabled, id, className, "data-testid": testId, "aria-label": ariaLabel }: {
  value: number | undefined | null;
  options: ComboOption[];
  onChange: (v: number | undefined) => void;
  onSubmit?: () => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  /** On the wrapper (old markup put ids there, and tests look up the input inside it). */
  id?: string;
  className?: string;
  "data-testid"?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState<string | null>(null); // null = not typing: show the selected name
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.id === value);
  const close = () => { setOpen(false); setTerm(null); };
  useDismiss(open, close, root);

  const filtered = useMemo(() => {
    const q = normalize(term ?? "");
    return q ? options.filter((o) => normalize(o.name).includes(q)) : options;
  }, [options, term]);
  // Rows: an optional "clear" row (id -1) and the matches.
  const rows: { id: number; name: string }[] = [...(clearable ? [{ id: -1, name: "—" }] : []), ...filtered];

  const pick = (id: number) => {
    onChange(id === -1 ? undefined : id);
    close();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      if (open && term !== null && filtered.length) { e.preventDefault(); pick(rows[active]?.id ?? filtered[0].id); return; }
      if (value !== undefined && value !== null) { e.preventDefault(); close(); onSubmit?.(); return; }
      if (filtered[0]) { e.preventDefault(); pick(filtered[0].id); }
    } else if (e.key === "Tab") close();
  };

  return (
    <div ref={root} id={id} className={cn("relative w-full", className)} data-testid={testId}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        disabled={disabled}
        value={term ?? selected?.name ?? ""}
        placeholder={selected ? selected.name : (placeholder ?? t("common.combobox.search"))}
        onClick={() => { if (!open) { setActive(0); setOpen(true); } }}
        onFocus={() => { setActive(0); setOpen(true); }}
        onChange={(e) => { setTerm(e.target.value); setActive(clearable ? 1 : 0); setOpen(true); }}
        onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) close(); }}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      />
      {open && (
        <div id={listId} role="listbox" className={listboxClass}>
          {rows.map((o, i) => (
            <div
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.id)}
              className={cn(optionClass(i === active, o.id === value), o.id === -1 && "text-muted-foreground")}
            >
              {o.name}
            </div>
          ))}
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">{t("common.combobox.empty")}</div>}
        </div>
      )}
    </div>
  );
}

/** Pick several: chips for the picked ones, and a combobox of the rest that resets after each pick. */
export function ChipMultiSelect({ value, options, onChange, placeholder, emoji }: { value: number[]; options: ComboOption[]; onChange: (v: number[]) => void; placeholder?: string; emoji?: string }) {
  const picked = value.map((id) => options.find((o) => o.id === id)).filter((o): o is ComboOption => !!o);
  const rest = options.filter((o) => !value.includes(o.id));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {picked.map((item) => (
        <span key={item.id} data-testid="selected-chip" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {emoji && <span aria-hidden>{emoji}</span>}
          <span>{item.name}</span>
          <button type="button" className="ml-0.5 leading-none hover:text-foreground" aria-label={t("common.remove")} onClick={() => onChange(value.filter((x) => x !== item.id))}>×</button>
        </span>
      ))}
      <div className="min-w-40 flex-1">
        <Combobox value={undefined} options={rest} placeholder={placeholder} onChange={(v) => { if (v !== undefined) onChange([...value, v]); }} />
      </div>
    </div>
  );
}
