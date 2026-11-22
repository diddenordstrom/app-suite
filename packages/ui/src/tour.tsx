import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { tShared } from "@homelab/i18n";
import { cn } from "./cn";

/**
 * Guided spotlight tours. Mark elements with `data-tour="<id>"`, describe a tour as steps, and the
 * provider dims the page, cuts a hole around the step's element and shows a card beside it.
 *
 * A step moves on by its `advance`:
 * - "next" (default): the Next button. The highlighted element can't be clicked meanwhile.
 * - "click": the user clicks the highlighted element itself ("tap Settings").
 * - { signal }: the app calls `signal(name)` when something happened ("the key was saved"),
 *   while the user works in the highlighted area. A "Skip this step" link is always there.
 *
 * `route` makes the tour navigate there first. Which tours a user has seen is the app's to store;
 * the provider just reports a finished or closed tour through `onSeen`.
 */

export type TourAdvance = "next" | "click" | { signal: string };
export interface TourStep {
  /** `data-tour` id of the element to spotlight. None, or not found within 3 s: a centred card. */
  target?: string;
  /** Pathname this step lives on; the tour navigates there before looking for the target. */
  route?: string;
  title: string;
  body: string;
  advance?: TourAdvance;
  /** Skip this step when its element isn't on the page (e.g. a button only some users have). */
  optional?: boolean;
}
export interface Tour { id: string; steps: TourStep[] }

interface TourCtx {
  start: (tour: Tour) => void;
  stop: () => void;
  /** Tell the running tour something happened; a step waiting for this signal moves on. */
  signal: (name: string) => void;
  /** Id of the running tour, if any. */
  active: string | null;
  /** Ids of finished tours, null while the app is still loading them. */
  seen: string[] | null;
  /** Record something as seen without running a tour (a "what's new" entry that was closed). */
  markSeen: (id: string) => void;
}

const Ctx = createContext<TourCtx>({ start: () => {}, stop: () => {}, signal: () => {}, active: null, seen: null, markSeen: () => {} });
export const useTour = () => useContext(Ctx);

export function TourProvider({ seen, onSeen, children }: { seen: string[] | null; onSeen: (id: string) => void; children: ReactNode }) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  // Finished here but maybe not yet back from the app's store: never start them again meanwhile.
  const [doneHere, setDoneHere] = useState<string[]>([]);

  const finish = useCallback(() => {
    setTour((cur) => {
      if (cur) { onSeen(cur.id); setDoneHere((d) => [...d, cur.id]); }
      return null;
    });
  }, [onSeen]);

  const markSeen = useCallback((id: string) => { onSeen(id); setDoneHere((d) => [...d, id]); }, [onSeen]);
  const start = useCallback((next: Tour) => { if (next.steps.length) { setIndex(0); setTour(next); } }, []);
  const go = useCallback((delta: number) => {
    if (!tour) return;
    const n = index + delta;
    setDir(delta < 0 ? -1 : 1);
    if (n >= tour.steps.length) finish();
    else setIndex(Math.max(0, n));
  }, [tour, index, finish]);

  const step = tour?.steps[index] ?? null;
  const signal = useCallback((name: string) => {
    const a = step?.advance;
    if (a && typeof a === "object" && a.signal === name) go(1);
  }, [step, go]);

  const allSeen = useMemo(() => (seen ? [...new Set([...seen, ...doneHere])] : null), [seen, doneHere]);
  const value = useMemo<TourCtx>(() => ({ start, stop: finish, signal, active: tour?.id ?? null, seen: allSeen, markSeen }), [start, finish, signal, tour, allSeen, markSeen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {tour && step && <Spotlight key={`${tour.id}:${index}`} step={step} index={index} total={tour.steps.length} onNext={() => go(1)} onBack={() => go(-1)} onSkip={() => go(dir)} onClose={finish} />}
    </Ctx.Provider>
  );
}

/**
 * Start `tour` once, the first time this mounts for a user who hasn't seen it.
 * `after`: only once that tour is seen (page tours wait for the first-login tour).
 */
export function useAutoTour(tour: Tour | null, opts: { after?: string } = {}) {
  const { seen, active, start } = useTour();
  const id = tour?.id;
  const ref = useRef(tour);
  ref.current = tour;
  useEffect(() => {
    if (!ref.current || !seen || active) return;
    if (seen.includes(ref.current.id)) return;
    if (opts.after && !seen.includes(opts.after)) return;
    start(ref.current);
  }, [id, seen, active, start, opts.after]);
}

const PAD = 6;
const GAP = 12;

function findTarget(id: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** How long the element must stay put before the spotlight is first drawn (the page is still scrolling to it). */
const SETTLE_MS = 120;

/**
 * The element's box, followed every frame (it may move as the page loads, scrolls or resizes).
 * `settled` turns true once the box has stopped moving after the scroll to it, so the spotlight
 * is never drawn while the page is still sliding underneath it.
 */
function useTargetRect(target: string | undefined) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [settled, setSettled] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!target) return;
    const t0 = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = "";
    let changedAt = t0;
    let isSettled = false;
    let scrolled = false;
    const tick = () => {
      const el = findTarget(target);
      elRef.current = el;
      const now = performance.now();
      if (el) {
        if (!scrolled) { scrolled = true; changedAt = now; el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" }); }
        const r = el.getBoundingClientRect();
        const k = `${r.left}|${r.top}|${r.width}|${r.height}`;
        if (k !== last) { last = k; changedAt = now; setRect(r); setMissing(false); }
        else if (!isSettled && now - changedAt > SETTLE_MS) { isSettled = true; setSettled(true); }
      } else if (now - t0 > 3000) {
        setMissing(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return { rect: target ? rect : null, missing: !target || missing, settled, elRef };
}

function placeCard(rect: DOMRect | null, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(16, x), vw - w - 16);
  const clampY = (y: number) => Math.min(Math.max(16, y), vh - h - 16);
  if (!rect) return { left: (vw - w) / 2, top: clampY((vh - h) / 2) };
  const hole = { top: rect.top - PAD, bottom: rect.bottom + PAD, left: rect.left - PAD, right: rect.right + PAD };
  const midX = clampX(rect.left + rect.width / 2 - w / 2);
  if (hole.bottom + GAP + h <= vh - 16) return { left: midX, top: hole.bottom + GAP };
  if (hole.top - GAP - h >= 16) return { left: midX, top: hole.top - GAP - h };
  if (hole.right + GAP + w <= vw - 16) return { left: hole.right + GAP, top: clampY(rect.top) };
  if (hole.left - GAP - w >= 16) return { left: hole.left - GAP - w, top: clampY(rect.top) };
  // Bigger than the screen: pin the card to the bottom, over the element.
  return { left: (vw - w) / 2, top: vh - h - 16 };
}

function Spotlight({ step, index, total, onNext, onBack, onSkip, onClose }: {
  step: TourStep; index: number; total: number; onNext: () => void; onBack: () => void; onSkip: () => void; onClose: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const advance = step.advance ?? "next";
  const waitsForSignal = typeof advance === "object";

  useEffect(() => {
    if (step.route && pathname !== step.route) navigate(step.route);
    // Only on entering the step: a click step's own navigation must not be undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { rect, missing, settled, elRef } = useTargetRect(step.target);
  const skipMissing = !!step.optional && !!step.target && missing;
  useEffect(() => { if (skipMissing) onSkip(); }, [skipMissing, onSkip]);

  // "click" steps: the user's click on the element itself moves the tour on (after the click lands).
  useEffect(() => {
    if (advance !== "click") return;
    const onClick = (e: MouseEvent) => {
      const el = elRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) setTimeout(onNext, 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [advance, onNext, elRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ w: 340, h: 180 });
  const [, force] = useState(0);
  useLayoutEffect(() => {
    if (card.current) setSize({ w: card.current.offsetWidth, h: card.current.offsetHeight });
  }, [rect?.width, rect?.height, missing]);
  useEffect(() => {
    const onResize = () => force((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => { primary.current?.focus({ preventScroll: true }); }, []);

  // While looking for the element (up to 3 s) show only the dimmer, no card in the wrong place.
  const searching = (!!step.target && !missing && (!rect || !settled)) || skipMissing;
  const shown = rect && !missing && settled ? rect : null;
  const pos = placeCard(shown, size.w, size.h);
  const hole = shown && { top: shown.top - PAD, left: shown.left - PAD, width: shown.width + PAD * 2, height: shown.height + PAD * 2 };
  const last = index === total - 1;
  // On a "click" step, Next does what the step asks (opens the session, goes to Settings), so the
  // steps after it find what they point at. The click listener above then moves the tour on.
  const nextOnClickStep = () => {
    const el = elRef.current;
    if (advance === "click" && el) el.click();
    else onNext();
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60] *:pointer-events-auto" aria-live="polite">
      {hole ? (
        <>
          <div className="fixed left-0 right-0 top-0 bg-overlay" style={{ height: Math.max(0, hole.top) }} />
          <div className="fixed left-0 right-0 bottom-0 bg-overlay" style={{ top: hole.top + hole.height }} />
          <div className="fixed left-0 bg-overlay" style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }} />
          <div className="fixed right-0 bg-overlay" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} />
          {advance === "next" && <div className="fixed" style={hole} />}
          <div className="pointer-events-none! fixed rounded-lg ring-[3px] ring-signature" style={hole} />
        </>
      ) : (
        <div className="fixed inset-0 bg-overlay" />
      )}

      {!searching && (
        <div ref={card} role="dialog" aria-labelledby="tour-title" aria-describedby="tour-body"
          className="fixed w-[min(340px,calc(100vw-32px))] rounded-lg border border-border bg-card p-4 shadow-lg transition-[left,top] duration-300 motion-reduce:transition-none"
          style={{ left: pos.left, top: pos.top }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tabular-nums text-signature-foreground">{tShared("tour.step", { n: index + 1, total })}</span>
            <button type="button" onClick={onClose} aria-label={tShared("tour.end")}
              className="-mr-2 -mt-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <h2 id="tour-title" className="mt-1 text-base font-semibold">{step.title}</h2>
          <p id="tour-body" className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{step.body}</p>
          {advance === "click" && shown && <p className="mt-2 text-sm font-medium text-signature-foreground">{tShared("tour.clickHint")}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex gap-1.5" aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-signature" : "w-1.5 bg-border")} />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {index > 0 && <button type="button" onClick={onBack} className="h-9 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent">{tShared("tour.back")}</button>}
              {advance === "next" || !shown ? (
                <button ref={primary} type="button" onClick={onNext} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                  {last ? tShared("tour.done") : tShared("tour.next")}
                </button>
              ) : (
                <button ref={primary} type="button" onClick={nextOnClickStep} className="h-9 whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground underline-offset-2 hover:underline">
                  {waitsForSignal ? tShared("tour.skipStep") : tShared("tour.next")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
