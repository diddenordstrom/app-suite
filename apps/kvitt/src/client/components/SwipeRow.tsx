import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "../ui";

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  /** Classes for the revealed background (semantic tokens only). */
  className: string;
  run: () => void;
}

const INTENT_PX = 10; // horizontal movement before we claim the gesture
const COMMIT_RATIO = 0.35; // of row width
const FLICK_V = 0.6; // px/ms
const FLICK_MIN_PX = 40;

/** Light haptic tick where supported (no-op on iOS Safari / desktop). */
export function haptic() {
  (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(10);
}

/**
 * Row that can be swiped right (`right` action) or left (`left` action). The foreground translates
 * with the finger, revealing a tinted action background. Vertical scrolling stays native (pan-y);
 * a horizontal drag only starts after INTENT_PX of mostly-horizontal movement. Taps pass through.
 */
export function SwipeRow({ right, left, children, className }: { right: SwipeAction; left: SwipeAction; children: ReactNode; className?: string }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(360);
  const g = useRef<{ id: number; x: number; y: number; w: number; drag: boolean; lx: number; lt: number; v: number } | null>(null);
  const suppressClick = useRef(false);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    suppressClick.current = false;
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, w: e.currentTarget.offsetWidth, drag: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.drag) {
      if (Math.abs(my) > INTENT_PX && Math.abs(my) >= Math.abs(mx)) { g.current = null; return; } // vertical: let it scroll
      if (Math.abs(mx) < INTENT_PX || Math.abs(mx) < Math.abs(my)) return;
      s.drag = true;
      s.x = e.clientX; // start from here so the row doesn't jump by INTENT_PX
      e.currentTarget.setPointerCapture(e.pointerId);
      setWidth(s.w);
      setDragging(true);
    }
    const dt = e.timeStamp - s.lt;
    if (dt > 0) s.v = (e.clientX - s.lx) / dt;
    s.lx = e.clientX;
    s.lt = e.timeStamp;
    setDx(e.clientX - s.x);
  };

  const end = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId || !s.drag) return;
    suppressClick.current = true;
    const d = e.clientX - s.x;
    const flick = Math.abs(s.v) > FLICK_V && Math.abs(d) > FLICK_MIN_PX && Math.sign(s.v) === Math.sign(d);
    if (!cancelled && (Math.abs(d) > s.w * COMMIT_RATIO || flick)) {
      haptic();
      (d > 0 ? right : left).run();
    }
    setDragging(false);
    setDx(0);
  };

  const armed = Math.abs(dx) > width * COMMIT_RATIO;
  const action = dx > 0 ? right : dx < 0 ? left : null;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {action && (
        <div aria-hidden className={cn("absolute inset-0 flex items-center px-5", dx > 0 ? "justify-start" : "justify-end", action.className)}>
          <span className={cn("flex items-center gap-2 text-sm font-semibold transition-transform", armed ? "scale-110" : "scale-90 opacity-70")}>
            {dx > 0 && action.icon}
            {action.label}
            {dx < 0 && action.icon}
          </span>
        </div>
      )}
      <div
        className={cn("relative touch-pan-y bg-card select-none", !dragging && "transition-transform duration-200 ease-out")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onClickCapture={(e) => {
          if (suppressClick.current) { suppressClick.current = false; e.preventDefault(); e.stopPropagation(); }
        }}
      >
        {children}
      </div>
    </div>
  );
}
