import { useEffect, useState, type ReactNode } from "react";
import { tShared } from "@homelab/i18n";
import { cn } from "./cn";

/**
 * Loading placeholders shaped like the page that is coming, so nothing jumps when the data lands.
 * They stay invisible for the first moment (the server often answers within it) and then fade in,
 * so a fast load shows no flash and a slow one shows the page's outline instead of "Loading…".
 */

/** True once `ms` has passed since mount. */
export function useDelayed(ms = 150) {
  const [on, setOn] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return on;
}

/** A grey block with a slow shimmer (none with reduced motion). Size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4 rounded-md", className)} />;
}

/** A card outline: a title bar and a few lines, or your own skeleton children. */
export function SkeletonCard({ lines = 3, className, children }: { lines?: number; className?: string; children?: ReactNode }) {
  return (
    <div aria-hidden className={cn("rounded-lg border border-card-edge bg-card p-4 shadow-card", className)}>
      <Skeleton className="mb-4 h-3.5 w-28" />
      {children ?? (
        <div className="space-y-2.5">
          {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={i === lines - 1 ? "w-3/5" : "w-full"} />)}
        </div>
      )}
    </div>
  );
}

/**
 * The frame every page skeleton sits in: announces "loading" to screen readers and keeps the
 * placeholder invisible (but taking its space) until the short delay has passed.
 */
export function SkeletonPage({ children, className, delay = 150 }: { children: ReactNode; className?: string; delay?: number }) {
  const shown = useDelayed(delay);
  return (
    <div role="status" aria-label={tShared("common.loading")} aria-busy className={cn("transition-opacity duration-300", shown ? "opacity-100" : "opacity-0", className)}>
      {children}
    </div>
  );
}

/** A page title and its subtitle line. */
export function SkeletonHeader({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-3.5 w-32" /></div>
      {action && <Skeleton className="h-9 w-28 rounded-md" />}
    </div>
  );
}

/** A generic page: title plus a grid of cards (the common case), or rows for a list page. */
export function PageSkeleton({ cards = 4, columns = "md:grid-cols-2", rows, header = true, className }: {
  cards?: number; columns?: string; /** A list page: this many rows in one card instead of a grid. */ rows?: number; header?: boolean; className?: string;
}) {
  return (
    <SkeletonPage className={cn("space-y-4", className)}>
      {header && <SkeletonHeader />}
      {rows ? <SkeletonRows rows={rows} /> : (
        <div className={cn("grid gap-4", columns)}>
          {Array.from({ length: cards }, (_, i) => <SkeletonCard key={i} lines={i % 2 ? 4 : 3} />)}
        </div>
      )}
    </SkeletonPage>
  );
}

/** List rows in one card: a dot, a line and a short value per row. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("divide-y divide-border rounded-lg border border-card-edge bg-card shadow-card", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className={i % 2 ? "w-1/2" : "w-2/3"} /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
