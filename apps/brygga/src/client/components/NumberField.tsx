import { useEffect, useId, useState, type ReactNode } from "react";
import { formatNumber, parseNumber, type Kind } from "@/shared/format";
import { locale } from "../i18n";
import { Field } from "../ui";

export interface NumberFieldProps {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  kind: Kind;
  /** With a slider: its range and step. */
  slider?: { min: number; max: number; step: number };
  /** Hard limits for typed values. */
  min?: number;
  max?: number;
  hint?: ReactNode;
}

/**
 * A number typed as text (money accepts 3M / 500k), optionally with a slider. The text is
 * the visitor's while they type and is reformatted when they leave the field or press Enter.
 */
export function NumberField({ label, value, onChange, kind, slider, min, max, hint }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => formatNumber(value, kind, locale));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(formatNumber(value, kind, locale));
  }, [value, kind, editing]);

  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (s: string) => {
    const v = parseNumber(s, kind);
    if (!Number.isNaN(v)) onChange(clamp(v));
  };
  const invalid = editing && text.trim() !== "" && Number.isNaN(parseNumber(text, kind));

  return (
    <Field label={label} hint={hint}>
      <div className={slider ? "grid grid-cols-[1fr_8.5rem] items-center gap-3" : undefined}>
        <input
          id={`${id}-n`}
          aria-label={typeof label === "string" ? label : undefined}
          type="text"
          inputMode="decimal"
          value={text}
          aria-invalid={invalid || undefined}
          onFocus={() => setEditing(true)}
          onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
          onBlur={() => { setEditing(false); setText(formatNumber(value, kind, locale)); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="order-2 h-9 w-full rounded-md border border-border bg-background px-2.5 text-right text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-danger"
        />
        {slider && (
          <input
            type="range"
            aria-label={typeof label === "string" ? label : undefined}
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={Math.min(slider.max, Math.max(slider.min, value))}
            onChange={(e) => onChange(Number(e.target.value))}
            className="order-1 w-full accent-[var(--signature)]"
          />
        )}
      </div>
    </Field>
  );
}
