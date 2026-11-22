import { useRef, useState } from "react";
import { cn } from "../ui";
import { useDismiss } from "./Select";

/** Sort button with a small menu; picking the active key again flips the direction. */
export function SortMenu<K extends string>({ label, options, value, desc, onPick }: { label: string; options: { key: K; label: string }[]; value: K; desc: boolean; onPick: (k: K) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} data-testid="sort-button" onClick={() => setOpen(!open)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent">
        <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        </svg>
      </button>
      {open && (
        <div data-testid="sort-menu" className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-card-edge bg-card shadow-card py-1 shadow-lg">
          {options.map((o) => (
            <button key={o.key} type="button" onClick={() => { onPick(o.key); setOpen(false); }}
              className={cn("flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent", value === o.key && "font-semibold")}>
              <span>{o.label}</span>
              {value === o.key && <span className="text-muted-foreground">{desc ? "↓" : "↑"}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
