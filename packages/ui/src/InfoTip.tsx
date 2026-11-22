import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tShared } from "@homelab/i18n";
import { cn } from "./cn";

/**
 * A small ⓘ next to a label that explains it in a sentence or two (a "toggletip").
 * Opens on hover with a mouse, on tap or Enter/Space everywhere; closes on Esc, a tap
 * outside, scrolling or moving the mouse away. The bubble is portalled so cards never clip it.
 */
export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Opened by hover: leaving closes it. Opened by tap/keyboard: stays until dismissed.
  const pinned = useRef(false);
  const hoverTimer = useRef<number>(undefined);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const close = useCallback(() => { pinned.current = false; setOpen(false); }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) { setPos(null); return; }
    const b = btn.current.getBoundingClientRect();
    const w = tip.current.offsetWidth, h = tip.current.offsetHeight;
    const left = Math.min(Math.max(8, b.left + b.width / 2 - w / 2), window.innerWidth - w - 8);
    const above = b.bottom + 8 + h > window.innerHeight && b.top - 8 - h > 0;
    setPos({ left, top: above ? b.top - 8 - h : b.bottom + 8, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!btn.current?.contains(n) && !tip.current?.contains(n)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const hover = (on: boolean) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(on), on ? 150 : 100);
  };

  return (
    <>
      <button ref={btn} type="button" aria-label={tShared("info.about", { label })} aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => { if (open && pinned.current) close(); else { pinned.current = true; setOpen(true); } }}
        onPointerEnter={hover(true)} onPointerLeave={hover(false)}
        className={cn("relative inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring after:absolute after:-inset-2.5 after:content-['']", open && "text-foreground", className)}>
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={tip} id={id} role="tooltip" onPointerEnter={hover(true)} onPointerLeave={hover(false)}
          className={cn("fixed z-[70] w-max max-w-[min(280px,calc(100vw-16px))] rounded-md border border-border bg-card px-3 py-2 text-sm leading-snug text-foreground shadow-lg", !pos && "invisible")}
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0 }}>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
