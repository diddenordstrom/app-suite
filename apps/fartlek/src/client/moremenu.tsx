import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "./i18n";
import { Button, cn } from "./ui";

/** Less used actions behind "⋯" (the plan's header, a block's card): links or buttons in a small menu. */
export function MoreMenu({ items, className }: { items: { label: string; to?: string; onClick?: () => void }[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const cls = "flex h-9 w-full items-center rounded-md px-2.5 text-left text-sm hover:bg-accent";
  return (
    <div ref={ref} className="relative">
      <Button variant="outline" className={cn("h-8 w-8 p-0", className)} aria-label={t("plan.more")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-60 rounded-lg border border-border bg-card p-1 shadow-lg">
          {items.map((it) => it.to
            ? <Link key={it.label} role="menuitem" to={it.to} className={cls} onClick={() => setOpen(false)}>{it.label}</Link>
            : <button key={it.label} type="button" role="menuitem" className={cls} onClick={() => { setOpen(false); it.onClick?.(); }}>{it.label}</button>)}
        </div>
      )}
    </div>
  );
}
