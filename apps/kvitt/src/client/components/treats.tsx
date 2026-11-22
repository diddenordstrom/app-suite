import { CATEGORY_KEYS } from "@/shared/gifts";
import { useHousehold } from "../household";
import { cn } from "../ui";
import { t, type MsgKey } from "../i18n";

const isKey = (c: string): boolean => (CATEGORY_KEYS as readonly string[]).includes(c);

/**
 * Label for a stored category: a known key shows the household's own name for the slot, else the translated default;
 * free text (older expenses) is shown as written.
 */
export const categoryLabel = (category: string, labels: Record<string, string> = {}): string =>
  isKey(category) ? (labels[category] ?? t(`category.${category}` as MsgKey)) : category;

/** Category chips: the fixed keys, plus the expense's own free-text category when it has one. */
export function CategoryChips({ value, onChange }: { value: string; onChange: (category: string) => void }) {
  const labels = useHousehold().detail.settings.categoryLabels;
  const options = [...CATEGORY_KEYS as readonly string[], ...(value && !isKey(value) ? [value] : [])];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("expense.category")}>
      {options.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(value === c ? "" : c)}
          className={cn(
            "min-h-10 rounded-full border px-3.5 text-sm transition focus-visible:outline-2 focus-visible:outline-ring",
            value === c ? "border-signature bg-signature-soft font-semibold text-signature-foreground" : "border-border bg-card font-medium hover:bg-muted",
          )}
        >
          {categoryLabel(c, labels)}
        </button>
      ))}
    </div>
  );
}

/** A − count + stepper with accessible labels. */
export function Stepper({ value, min = 0, max, onChange, lessLabel, moreLabel }: { value: number; min?: number; max?: number; onChange: (n: number) => void; lessLabel: string; moreLabel: string }) {
  const btn = "flex size-11 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40";
  return (
    <div className="flex items-center">
      <button type="button" aria-label={lessLabel} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label={moreLabel} className={cn(btn, "text-signature-foreground")} disabled={max !== undefined && value >= max} onClick={() => onChange(value + 1)}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}
