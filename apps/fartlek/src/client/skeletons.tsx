import { Skeleton, SkeletonCard, SkeletonHeader, SkeletonPage, SkeletonRows } from "./ui";

/* Placeholders shaped like each page's real layout, so nothing jumps when the data arrives. */

export function HomeSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-6xl space-y-4">
      <SkeletonHeader />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <SkeletonCard className="md:col-span-2 lg:col-span-3">
          <div className="flex items-end gap-3"><Skeleton className="h-14 w-24" /><Skeleton className="h-7 w-28" /></div>
          <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-3 w-3/4" />
          <Skeleton className="mt-4 h-16 w-full rounded-md" />
        </SkeletonCard>
        <SkeletonCard className="md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-5">
            <Skeleton className="size-32 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className={i % 2 ? "w-2/3" : "w-4/5"} />)}</div>
          </div>
        </SkeletonCard>
        <SkeletonCard className="lg:col-span-2" lines={4} />
        <SkeletonCard className="lg:col-span-2">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
        </SkeletonCard>
        <SkeletonCard className="md:col-span-2 lg:col-span-2">
          <Skeleton className="h-28 w-full" />
          <div className="mt-3 grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
        </SkeletonCard>
      </div>
    </SkeletonPage>
  );
}

/** A grid of chart cards. */
export function TrendsSkeleton() {
  return (
    <SkeletonPage className="space-y-4">
      <SkeletonHeader action />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <SkeletonCard key={i}><Skeleton className="h-48 w-full" /></SkeletonCard>)}
      </div>
    </SkeletonPage>
  );
}

/** One activity: title, a row of stats, then a chart. */
export function ActivitySkeleton() {
  return (
    <SkeletonPage className="space-y-4">
      <SkeletonHeader />
      <SkeletonCard>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-7 w-20" /></div>)}</div>
      </SkeletonCard>
      <SkeletonCard><Skeleton className="h-56 w-full" /></SkeletonCard>
    </SkeletonPage>
  );
}

/** The activity list before its first page has arrived. */
export function ActivityListSkeleton() {
  return <SkeletonPage><SkeletonRows rows={6} /></SkeletonPage>;
}

/** Blocks: a few block cards. */
export function BlocksSkeleton() {
  return (
    <SkeletonPage className="space-y-4">
      <SkeletonHeader action />
      {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={2} />)}
    </SkeletonPage>
  );
}

/** Statistik: the mirrored header, the period card, the key figures and two mirror cards. */
export function StatsSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-6xl space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-end">
        <div className="flex flex-col items-end gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-9 w-36" /></div>
        <span />
        <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-9 w-36" /></div>
      </div>
      <SkeletonCard lines={4} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><SkeletonCard lines={5} /><SkeletonCard lines={4} /></div>
    </SkeletonPage>
  );
}
