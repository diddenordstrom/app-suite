import { useLayoutEffect, useRef } from "react";

/**
 * Minimal FLIP reorder animation: attach `ref(key)` to each keyed element; when an element's
 * offsetTop changes between renders it slides from its old spot. Respects reduced motion.
 */
export function useFlip<K>(ms = 250) {
  const els = useRef(new Map<K, HTMLElement>());
  const prev = useRef(new Map<K, number>());

  useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<K, number>();
    for (const [k, el] of els.current) {
      const top = el.offsetTop;
      next.set(k, top);
      const old = prev.current.get(k);
      if (reduce || old === undefined || old === top) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${old - top}px)`;
      void el.offsetHeight; // commit the inverted position before animating back
      el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0, 0, 1)`;
      el.style.transform = "";
    }
    prev.current = next;
  });

  return (key: K) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el);
    else els.current.delete(key);
  };
}
