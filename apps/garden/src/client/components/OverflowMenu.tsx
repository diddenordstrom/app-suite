import { useRef, useState, type ReactNode } from "react";
import { Button } from "../ui";
import { useDismiss } from "./Select";

/** A ⋯ button with a small menu; any click inside the menu closes it. */
export function OverflowMenu({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div ref={ref} className="relative ml-auto">
      <Button variant="ghost" className="h-9" aria-label={label} aria-expanded={open} data-testid={testId} onClick={() => setOpen(!open)}>⋯</Button>
      {open && <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-md border border-border bg-card py-1 shadow-lg" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
