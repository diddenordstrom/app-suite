import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, cn } from "../ui";
import { get, useLoad } from "../api";
import { useHousehold } from "../household";
import { locale, t, type MsgKey } from "../i18n";
import { showError } from "../toast";
import { MacroBar } from "../components/MacroBar";
import { PageTitle, Skeleton } from "../components/common";
import { EVENT_TYPE_CHIP, type TimelineItem } from "../lib/events";
import { emptyMacro, macroCoverage, type MacroSummary, type MacroTarget } from "../lib/macros";

interface Activity { id: number; action: string; entityType: string; entityId: number; metadata: string | null; createdAt: string | null }
interface SelfSufficiencyCrop { cropId: number; cropName: string; annualDemandKg: number; storageKg: number; expectedYieldKg: number; coveredKg: number; coveragePct: number }
interface DashboardResponse {
  growing: MacroSummary;
  onHand: MacroSummary;
  producedThisYearKg: number;
  expensesThisYear: number;
  selfSufficiency: { crops: SelfSufficiencyCrop[]; averagePct: number } | null;
}
interface BedNudgeCandidate { suggestionId: number; cropId: number; cropName: string; daysToMaturity: number | null }
interface BedNudge { locationId: number; locationName: string; type: "empty" | "succession"; bedFreesUp: string | null; recentlyHarvested: boolean; candidates: BedNudgeCandidate[] }
interface BedNudgesResult { daysUntilFrost: number; beds: BedNudge[] }
interface Advisory { totalWishlistEntries: number; entriesWithDemand: number; weakestMacro: string | null; weakestPct: number | null; suggestions: { cropName: string }[] }
interface FlatSuggestion { suggestionId: number; cropName: string; locationName: string; daysToMaturity: number | null; type: "empty" | "succession"; recentlyHarvested: boolean }

/** A failed side request shows a toast and falls back instead of failing the page. */
const orToast = <T,>(fallback: T) => (err: unknown) => {
  showError(err instanceof Error ? err.message : String(err));
  return fallback;
};

/**
 * The top five suggestions across beds: empty and recently harvested beds first, then one candidate per bed
 * at a time (round-robin) so the list shows several beds rather than five crops for one.
 */
export function topSuggestions(beds: BedNudge[]): FlatSuggestion[] {
  const priority = (b: BedNudge) => (b.type === "empty" ? 0 : 2) + (b.recentlyHarvested ? 0 : 1);
  const sorted = [...beds].sort((a, b) => priority(a) - priority(b));
  const flat: FlatSuggestion[] = [];
  for (let depth = 0; depth < 10 && flat.length < 5; depth++) {
    let any = false;
    for (const bed of sorted) {
      const c = bed.candidates[depth];
      if (!c) continue;
      any = true;
      flat.push({ suggestionId: c.suggestionId, cropName: c.cropName, locationName: bed.locationName, daysToMaturity: c.daysToMaturity, type: bed.type, recentlyHarvested: bed.recentlyHarvested });
      if (flat.length === 5) return flat;
    }
    if (!any) break;
  }
  return flat;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d`;
  return date.toLocaleDateString(locale);
}

const activityDot: Record<string, string> = { created: "bg-success", deleted: "bg-danger", harvested: "bg-warning" };
const clampPct = (v: number) => (!Number.isFinite(v) || v <= 0 ? 0 : Math.min(v, 100));
const storagePct = (c: SelfSufficiencyCrop) => (c.annualDemandKg > 0 ? clampPct((c.storageKg / c.annualDemandKg) * 100) : 0);
const yieldPct = (c: SelfSufficiencyCrop) => (c.annualDemandKg > 0 ? Math.max(0, clampPct(((c.storageKg + c.expectedYieldKg) / c.annualDemandKg) * 100) - storagePct(c)) : 0);
const formatKg = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
/** Coverage colour: danger under 50 %, warning under 90 %, success from there. Yield is the same colour, lighter. */
const bucketColor = (pct: number) => (pct < 50 ? "bg-danger" : pct < 90 ? "bg-warning" : "bg-success");

export function Dashboard() {
  const { current } = useHousehold();
  const [expanded, setExpanded] = useState(false);
  const { data, loading } = useLoad(async () => {
    const hid = current.id;
    const [locations, plantings, storage, activity, dashboard, timeline, target, nudges, advisory] = await Promise.all([
      get<{ id: number }[]>("/location"),
      get<{ id: number; status: string }[]>("/planting"),
      get<{ id: number; quantityKg: number }[]>("/storage"),
      get<Activity[]>("/activity", { limit: 10 }),
      get<DashboardResponse>("/dashboard", { householdId: hid }),
      get<TimelineItem[]>("/timeline", { householdId: hid }).catch(orToast<TimelineItem[]>([])),
      get<MacroTarget>("/macro-target/active", { householdId: hid }).catch(() => null),
      get<BedNudgesResult>("/bed-nudges", { householdId: hid }).catch(orToast<BedNudgesResult>({ daysUntilFrost: 0, beds: [] })),
      get<Advisory>("/macro-advisory", { householdId: hid }).catch(orToast<Advisory | null>(null)),
    ]);
    return { locations, plantings, storage, activity, dashboard, timeline, target, nudges, advisory };
  }, [current.id]);

  if (loading && !data) return <><PageTitle className="mb-6">{t("dashboard.title")}</PageTitle><DashboardSkeleton /></>;
  if (!data) return <PageTitle className="mb-6">{t("dashboard.title")}</PageTitle>;

  const { dashboard, target, nudges, advisory } = data;
  const growing = dashboard.growing ?? emptyMacro;
  const onHand = dashboard.onHand ?? emptyMacro;
  const cov = macroCoverage(growing, onHand, target);
  const ss = dashboard.selfSufficiency ?? { crops: [], averagePct: 0 };
  const sortedCrops = [...ss.crops].sort((a, b) => a.coveragePct - b.coveragePct);
  const activePlantings = data.plantings.filter((p) => p.status === "planted" || p.status === "growing").length;
  const storageKg = Math.round(data.storage.reduce((s, x) => s + x.quantityKg, 0) * 10) / 10;
  const produced = Math.round(dashboard.producedThisYearKg * 10) / 10;
  const macroTip = advisory && advisory.entriesWithDemand === advisory.totalWishlistEntries && advisory.weakestMacro && advisory.weakestPct !== null ? advisory : null;
  const suggestions = topSuggestions(nudges.beds);
  const upcoming = data.timeline.slice(0, 3);
  const kcal = (n: number) => n.toLocaleString(locale);

  return (
    <div>
      <PageTitle className="mb-6">{t("dashboard.title")}</PageTitle>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BigStat testId="dashboard-growing-card" label={t("dashboard.growing.title")} value={kcal(growing.kcal)} unit={t("dashboard.stats.kcal.unit")} sub={t("dashboard.growing.subtitle")} />
        <BigStat testId="dashboard-onhand-card" label={t("dashboard.onHand.title")} value={kcal(onHand.kcal)} unit={t("dashboard.stats.kcal.unit")}
          sub={cov.daysOfRunway !== null ? t("dashboard.onHand.daysOfRunway", { days: cov.daysOfRunway }) : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BigStat label={t("dashboard.stats.plantings.label")} value={activePlantings} sub={t("dashboard.stats.plantings.description")} />
        <Card data-testid="dashboard-self-sufficiency-card">
          <p className="text-sm text-muted-foreground">{t("dashboard.stats.selfSufficiency.label")}</p>
          <p className="mt-2 flex items-baseline gap-1">
            <span data-testid="self-sufficiency-pct" className="text-3xl font-bold tracking-tight tabular-nums">{ss.averagePct}</span>
            <span className="text-sm text-muted-foreground">%</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ss.crops.length === 0 ? t("dashboard.stats.selfSufficiency.noDemand") : t("dashboard.stats.selfSufficiency.description", { count: ss.crops.length })}
          </p>
          {macroTip && (
            <p className="mt-2 text-xs text-warning" data-testid="dashboard-macro-tip">
              {t("dashboard.stats.selfSufficiency.macroTip", {
                pct: macroTip.weakestPct ?? 0,
                macro: t(`settings.macroAdvisory.macroNames.${macroTip.weakestMacro}` as MsgKey),
                crops: macroTip.suggestions.map((s) => s.cropName).join(", "),
              })}
            </p>
          )}
          {ss.crops.length > 0 && (
            <button type="button" data-testid="self-sufficiency-expand-toggle" aria-expanded={expanded} aria-controls="self-sufficiency-detail-list"
              onClick={() => setExpanded(!expanded)} className="mt-3 flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline">
              <span>{expanded ? t("dashboard.stats.selfSufficiency.collapse") : t("dashboard.stats.selfSufficiency.expand")}</span>
              <span aria-hidden>{expanded ? "▴" : "▾"}</span>
            </button>
          )}
          {ss.crops.length > 0 && (
            <ul id="self-sufficiency-detail-list" data-testid="self-sufficiency-detail-list" hidden={!expanded} className="mt-3 space-y-3">
              {sortedCrops.map((c) => (
                <li key={c.cropId} data-testid={`self-sufficiency-crop-${c.cropId}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{c.cropName}</span>
                    <span className="tabular-nums text-muted-foreground">{c.coveragePct}%</span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={c.coveragePct} aria-valuemin={0} aria-valuemax={100} aria-label={c.cropName}>
                    <div className={cn("absolute inset-y-0 left-0", bucketColor(c.coveragePct))} style={{ width: `${storagePct(c)}%` }} data-testid="self-sufficiency-bar-storage" />
                    <div className={cn("absolute inset-y-0 opacity-45", bucketColor(c.coveragePct))} style={{ left: `${storagePct(c)}%`, width: `${yieldPct(c)}%` }} data-testid="self-sufficiency-bar-yield" />
                  </div>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {t("dashboard.stats.selfSufficiency.breakdown", { storage: formatKg(c.storageKg), yield: formatKg(c.expectedYieldKg), demand: formatKg(c.annualDemandKg) })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <BigStat testId="dashboard-produced-card" label={t("dashboard.stats.produced.label")} value={produced} unit={t("dashboard.stats.produced.unit")}
          sub={t("dashboard.stats.produced.description", { year: new Date().getFullYear() })} />
      </div>

      <Card className="mt-6" data-testid="macro-bars-section">
        <p className="mb-3 text-sm font-medium">{t("dashboard.nutrition.title")}</p>
        {!target ? (
          <p data-testid="macro-bars-empty" className="text-sm text-muted-foreground">{t("dashboard.nutrition.noProfile")}</p>
        ) : (
          <div className="space-y-3">
            <MacroBar testId="macro-bar-protein" label={t("dashboard.nutrition.protein")} currentG={cov.combined.proteinG} targetG={target.dailyProteinG * 365} percent={cov.proteinPercent} color="bg-chart-1" />
            <MacroBar testId="macro-bar-carbs" label={t("dashboard.nutrition.carbs")} currentG={cov.combined.carbsG} targetG={target.dailyCarbsG * 365} percent={cov.carbsPercent} color="bg-chart-2" />
            <MacroBar testId="macro-bar-fat" label={t("dashboard.nutrition.fat")} currentG={cov.combined.fatG} targetG={target.dailyFatG * 365} percent={cov.fatPercent} color="bg-chart-3" />
          </div>
        )}
      </Card>

      <BigStat className="mt-3" label={t("dashboard.stats.kcal.label")} value={kcal(cov.combined.kcal)} unit={t("dashboard.stats.kcal.unit")} sub={t("dashboard.stats.kcal.description")} />

      <div className="mt-6 flex flex-wrap gap-3">
        {[
          [activePlantings, t("dashboard.summary.activePlantings")],
          [data.locations.length, t("dashboard.summary.locations")],
          [storageKg, t("dashboard.summary.storageKg")],
        ].map(([n, label]) => (
          <div key={String(label)} className="flex min-w-[120px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-2xl font-bold tracking-tight tabular-nums">{n}</span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <Card className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t("dashboard.expenses.label")}</p>
          <Link to="/finances" className="text-xs text-primary hover:underline">{t("dashboard.upcomingEvents.viewAll")}</Link>
        </div>
        <p className="mt-2 flex items-baseline gap-1">
          <span data-testid="dashboard-expenses-total" className="text-3xl font-bold tracking-tight tabular-nums">{(dashboard.expensesThisYear ?? 0).toLocaleString("sv-SE")}</span>
          <span className="text-sm text-muted-foreground">kr</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.expenses.description")}</p>
      </Card>

      {suggestions.length > 0 && (
        <Card className="mt-6" data-testid="suggestions-widget">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("suggestions.widgetTitle")}</p>
            <Link to="/suggestions" className="text-xs text-primary hover:underline">{t("suggestions.viewAll")}</Link>
          </div>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">{t("dashboard.succession.daysUntilFrost", { days: nudges.daysUntilFrost })}</p>
          <ul className="divide-y divide-border">
            {suggestions.map((s) => (
              <li key={s.suggestionId} className="py-2 first:pt-0 last:pb-0" data-testid="suggestion-item">
                <Link to="/suggestions" className="-mx-1 flex items-center justify-between gap-2 rounded px-1 py-0.5 transition hover:bg-muted/40">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", s.type === "empty" ? "bg-success" : "bg-warning")} />
                    <span className="truncate text-sm font-medium">{s.cropName}</span>
                    <span className="truncate text-xs text-muted-foreground">{t("dashboard.suggestionIn", { location: s.locationName })}</span>
                    {s.recentlyHarvested && <span className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-xs" data-testid="suggestion-recent-harvest">🌾</span>}
                  </div>
                  {s.daysToMaturity !== null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.daysToMaturity}d</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6" data-testid="upcoming-events-widget">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">{t("dashboard.upcomingEvents.title")}</p>
          <Link to="/calendar" className="text-xs text-primary hover:underline">{t("dashboard.upcomingEvents.viewAll")}</Link>
        </div>
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((item) => <li key={`${item.type}-${item.id}`} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{item.date}</span>
              <span className="flex-1 truncate">{item.title}</span>
              <TimelineChip item={item} />
            </li>)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{t("calendar.noEvents")}</p>}
      </Card>

      <Card className="mt-6">
        <p className="mb-3 text-sm font-medium">{t("activity.title")}</p>
        {data.activity.length > 0 ? (
          <ul className="space-y-3">
            {data.activity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", activityDot[entry.action] ?? "bg-primary")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{t(`activity.actions.${entry.action}` as MsgKey)}</span>
                  <span className="text-muted-foreground"> {t(`activity.entities.${entry.entityType}` as MsgKey)}</span>
                </div>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{relativeTime(entry.createdAt)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>}
      </Card>
    </div>
  );
}

/** The small tag after a timeline row: harvest, transplant, harden-off, or the chore type. */
export function TimelineChip({ item }: { item: TimelineItem }) {
  const chip = "shrink-0 rounded px-1.5 py-0.5 text-xs";
  if (item.type === "harvest") return <span className={cn(chip, "bg-warning/15")}>{t("calendar.harvest")}</span>;
  if (item.suggestionType === "transplant") return <span className={cn(chip, "bg-success/15")} data-testid="transplant-due-chip">{t("calendar.transplantDue")}</span>;
  if (item.suggestionType === "harden_off") return <span className={cn(chip, "bg-chart-1/20")} data-testid="harden-off-chip">{t("calendar.hardenOff")}</span>;
  const type = item.eventType && item.eventType !== "general" ? EVENT_TYPE_CHIP[item.eventType] : undefined;
  if (!type) return null;
  return (
    <span data-testid={`event-type-chip-${item.eventType}`} className={cn(chip, "inline-flex items-center gap-1", type.className)}>
      <span aria-hidden>{type.emoji}</span><span>{t(`calendar.eventType.${item.eventType}` as MsgKey)}</span>
    </span>
  );
}

function BigStat({ label, value, unit, sub, testId, className }: { label: string; value: ReactNode; unit?: string; sub?: string; testId?: string; className?: string }) {
  return (
    <Card data-testid={testId} className={className}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton className="mb-3 h-4 w-24" /><Skeleton className="mb-2 h-8 w-32" /><Skeleton className="h-3 w-40" /></Card>)}</div>
      <Card className="space-y-3"><Skeleton className="h-4 w-28" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</Card>
      <Card className="space-y-2"><Skeleton className="h-4 w-32" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</Card>
    </div>
  );
}
