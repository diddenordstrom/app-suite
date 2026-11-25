import { useState } from "react";
import { api } from "./http";
import { t, tn } from "./i18n";
import { useFmt } from "./prefs";
import { Button, cn } from "./ui";
import { fmtDay } from "./bits";
import { weekNumber } from "@/shared/dates";
import { fmtClock } from "@/shared/format";
import type { WeekRole } from "@/shared/blockplan";
import type { PlanPhase, RaceRoad as Road, RoadWeek } from "@/shared/raceplan";

/*
 * The road to an A marathon or half (docs/decisions/fartlek-race-plan-skeleton.md): the phases as bands, one bar per week
 * (done grey, block and now solid, the skeleton dashed), the race, race pace and the long-run peak marked, and what the plan warns.
 */

const ROLE_COLOR: Record<WeekRole, string> = { build: "bg-signature", lighter: "bg-signature opacity-45", taper: "bg-chart-4", race: "bg-chart-4", recovery: "bg-signature opacity-30" };
const PHASE_KEY: Record<PlanPhase, "block.kind.base" | "block.kind.build" | "block.kind.specific" | "block.kind.taper" | "block.kind.recovery" | "road.phase.race"> = {
  base: "block.kind.base", build: "block.kind.build", specific: "block.kind.specific", taper: "block.kind.taper", race: "road.phase.race", recovery: "block.kind.recovery",
};
const day = (d: string) => fmtDay(d, { day: "numeric", month: "short" });

export function RaceRoad({ road, compact, onChanged }: { road: Road; compact?: boolean; onChanged?: () => void }) {
  const fmt = useFmt();
  const top = Math.max(1, ...road.weeks.map((w) => w.km ?? 0));
  const raceWeek = road.weeks.find((w) => w.wip === 1)?.weekStart ?? null;
  const nowWeeks = road.weeks.filter((w) => w.source === "now").length;
  const recWeeks = road.weeks.filter((w) => w.phase === "recovery").length;
  const label = (w: RoadWeek) => t("road.weekLabel", { week: weekNumber(w.weekStart), phase: t(PHASE_KEY[w.phase]), km: w.km == null ? "–" : fmt.dist(w.km) });
  const dist = t(road.race.kind === "marathon" ? "road.dist.marathon" : "road.dist.half");
  return (
    <section className="space-y-2" aria-label={t("road.title", { race: road.race.name })}>
      <div className="text-sm font-medium">{t("road.title", { race: road.race.name })}</div>
      {road.short && !compact && <ShortNote road={road} dist={dist} onChanged={onChanged} />}
      <div className="flex gap-0.5">
        {road.bands.map((b) => (
          <div key={b.from} className="min-w-0 overflow-hidden rounded-md bg-muted px-1.5 py-1 text-[11px]" style={{ flexGrow: b.weeks, flexBasis: 0 }} title={`${t(PHASE_KEY[b.phase])} · ${tn("be.weeksN", b.weeks)} · ${fmt.dist(b.km, 0)}`}>
            <div className="truncate font-semibold">{t(PHASE_KEY[b.phase])}</div>
            <div className="truncate text-muted-foreground">{tn("be.weeksN", b.weeks)} · {fmt.dist(b.km, 0)}</div>
          </div>
        ))}
      </div>
      <div className="pb-1">
        <div className="flex h-20 items-end gap-0.5" aria-hidden>
          {road.weeks.map((w) => (
            <div key={w.weekStart} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={label(w)}>
              {w.weekStart === raceWeek && <span className="absolute -top-0.5 text-[10px]">⚑</span>}
              <span
                aria-label={label(w)}
                className={cn("w-full rounded-sm",
                  w.source === "done" ? "bg-muted-foreground/40" : w.source === "skeleton" ? "border border-dashed border-signature opacity-60" : ROLE_COLOR[w.role],
                  w.source === "now" && "ring-1 ring-primary")}
                style={{ height: `${Math.max(4, ((w.km ?? 0) / top) * 85)}%` }} />
            </div>
          ))}
        </div>
      </div>
      {!compact && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {road.racePaceFrom && <p>{t("road.racePace")}: {t("plan.weekShort", { week: weekNumber(road.racePaceFrom) })}</p>}
          {road.longPeak && <p>{t("road.longPeak", { km: fmt.dist(road.longPeak.km) })} · {t("plan.weekShort", { week: weekNumber(road.longPeak.weekStart) })}</p>}
          {nowWeeks > 0 && <p>{t("road.now", { weeks: tn("be.weeksN", nowWeeks) })}</p>}
          {recWeeks > 0 && <p>{t("road.recovery", { weeks: tn("be.weeksN", recWeeks) })}</p>}
          {road.others.map((o) => (
            <p key={o.date}>
              {t("road.other", { name: o.name, date: day(o.date) })}
              {o.close && <> {t("road.otherClose", { name: o.name, date: day(o.date), race: road.race.name })}</>}
            </p>
          ))}
          {road.warnings.includes("longShort") && road.longPeak && <p className="text-warning">{t("road.longShort", { km: fmt.dist(road.longPeak.km) })}</p>}
        </div>
      )}
      {!compact && (
        <table className="sr-only">
          <caption>{t("road.title", { race: road.race.name })}</caption>
          <tbody>
            {road.weeks.map((w) => <tr key={w.weekStart}><td>{weekNumber(w.weekStart)}</td><td>{t(PHASE_KEY[w.phase])}</td><td>{w.km == null ? "–" : fmt.dist(w.km)}</td></tr>)}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Too little time: say so, and offer today's prediction as the goal (never applied without the tap). */
function ShortNote({ road, dist, onChanged }: { road: Road; dist: string; onChanged?: () => void }) {
  const s = road.short!;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const useGoal = async () => {
    if (s.suggestedSeconds == null) return;
    setBusy(true);
    try {
      const races = await api<{ id: number; name: string; date: string; distanceKm: number; priority: string; goalSeconds: number | null }[]>("/races");
      const r = races.find((x) => x.id === road.race.id);
      if (r) await api(`/races/${r.id}`, { method: "PUT", body: { name: r.name, date: r.date, distanceKm: r.distanceKm, priority: r.priority, goalSeconds: s.suggestedSeconds } });
      setDone(true);
      onChanged?.();
    } finally { setBusy(false); }
  };
  return (
    <div role="status" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <p>{t("road.short", { weeks: tn("be.weeksN", road.weeksToRace), race: road.race.name, dist, min: tn("be.weeksN", s.minWeeks) })}</p>
      {s.suggestedSeconds != null && !done && (
        <div className="flex flex-wrap items-center gap-2">
          <span>{t("road.goal.lower", { time: fmtClock(s.suggestedSeconds), goal: s.goalSeconds ? fmtClock(s.goalSeconds) : "–" })}</span>
          <Button variant="outline" className="h-8" disabled={busy} onClick={useGoal}>{t("road.goal.use", { time: fmtClock(s.suggestedSeconds) })}</Button>
        </div>
      )}
    </div>
  );
}
