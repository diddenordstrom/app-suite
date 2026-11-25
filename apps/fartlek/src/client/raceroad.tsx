import { useLayoutEffect, useRef, useState } from "react";
import { api } from "./http";
import { t, tn } from "./i18n";
import { useFmt } from "./prefs";
import { Button, Input, cn } from "./ui";
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
    <section className="space-y-3" aria-label={t("road.title", { race: road.race.name })}>
      <div className="text-sm font-medium">{t("road.title", { race: road.race.name })}</div>
      {road.short && !compact && <ShortNote road={road} dist={dist} onChanged={onChanged} />}
      {!compact && <CapRow road={road} onChanged={onChanged} />}
      <PhaseStrip road={road} />
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
        // The wrapper, not the table, is sr-only: a caption escapes a clipped table in some browsers and is drawn over what follows.
        <div className="sr-only">
          <table>
            <tbody>
              {road.weeks.map((w) => <tr key={w.weekStart}><td>{weekNumber(w.weekStart)}</td><td>{t(PHASE_KEY[w.phase])}</td><td>{w.km == null ? "–" : fmt.dist(w.km)}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type Fit = "full" | "name" | "short" | "none";
type Band = Road["bands"][number] & { withRace?: boolean };

/** The taper and the race week as one band (the taper, race week included): two 1-week bands read as a 1:1 block. */
export function stripBands(bands: Road["bands"]): Band[] {
  const out: Band[] = [];
  for (const b of bands) {
    const last = out.at(-1);
    if (b.phase === "race" && last?.phase === "taper" && !last.withRace) {
      out[out.length - 1] = { ...last, weeks: last.weeks + b.weeks, km: Math.round((last.km + b.km) * 10) / 10, withRace: true };
    } else out.push({ ...b });
  }
  return out;
}

/**
 * The phases as bands as wide as their weeks. A band shows only the text that fits whole (name and weeks, the name, the
 * weeks alone as "2 v", or nothing); the phases too narrow for their name are spelled out on a line under the strip
 * instead of cut to "N…". The taper band that holds the race week carries the ⚑.
 */
function PhaseStrip({ road }: { road: Road }) {
  const fmt = useFmt();
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The text stays laid out (only made invisible), so it can be measured again when the strip grows.
    const over = (e: Element | undefined) => !!e && e.scrollWidth > e.clientWidth + 0.5;
    const measure = () => {
      const next = Array.from(el.children, (band): Fit => over(band.children[0]) ? (over(band.children[2]) ? "none" : "short") : over(band.children[1]) ? "name" : "full");
      setFit((prev) => (prev.length === next.length && prev.every((f, i) => f === next[i]) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [road.bands]);
  const bands = stripBands(road.bands);
  const text = (b: Band) => b.withRace
    ? t("road.taperWithRace", { phase: t(PHASE_KEY[b.phase]), weeks: tn("be.weeksN", b.weeks), km: fmt.dist(b.km, 0) })
    : `${t(PHASE_KEY[b.phase])} · ${tn("be.weeksN", b.weeks)} · ${fmt.dist(b.km, 0)}`;
  const hidden = bands.filter((_, i) => fit[i] === "none" || fit[i] === "short");
  return (
    <div className="space-y-1">
      <div ref={ref} className="flex gap-0.5">
        {bands.map((b, i) => (
          <div key={b.from} className="relative min-w-0 overflow-hidden rounded-md bg-muted px-1.5 py-1 text-[11px]" style={{ flexGrow: b.weeks, flexBasis: 0 }} title={text(b)}>
            <div className={cn("overflow-hidden whitespace-nowrap font-semibold", fit[i] && fit[i] !== "full" && fit[i] !== "name" && "invisible")}>{b.withRace && "⚑ "}{t(PHASE_KEY[b.phase])}</div>
            <div className={cn("overflow-hidden whitespace-nowrap text-muted-foreground", fit[i] && fit[i] !== "full" && "invisible")}>{tn("be.weeksN", b.weeks)} · {fmt.dist(b.km, 0)}</div>
            <div className={cn("absolute inset-x-1.5 top-1 overflow-hidden whitespace-nowrap font-semibold", fit[i] !== "short" && "invisible")}>{b.withRace && "⚑ "}{t("road.weeksShort", { weeks: b.weeks })}</div>
          </div>
        ))}
      </div>
      {hidden.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{hidden.map((b) => `${t(PHASE_KEY[b.phase])} ${tn("be.weeksN", b.weeks)}`).join(" · ")}</p>
      )}
    </div>
  );
}

/** PUT the race with some fields changed, the rest as they are (the race routes take the whole race). */
async function putRace(id: number, patch: Record<string, unknown>) {
  const races = await api<{ id: number; name: string; date: string; distanceKm: number; priority: string; goalSeconds: number | null }[]>("/races");
  const r = races.find((x) => x.id === id);
  if (r) await api(`/races/${r.id}`, { method: "PUT", body: { name: r.name, date: r.date, distanceKm: r.distanceKm, priority: r.priority, goalSeconds: r.goalSeconds, ...patch } });
}

/** The cap on a build week (docs/decisions/fartlek-long-run-ceiling.md): set in km, a suggestion from the proven peak week. */
function CapRow({ road, onChanged }: { road: Road; onChanged?: () => void }) {
  const fmt = useFmt();
  const { km, suggestedKm, provenKm } = road.cap;
  const [value, setValue] = useState(km != null ? String(fmt.distNum(km)) : "");
  const [busy, setBusy] = useState(false);
  const save = async (next: number | null) => {
    setBusy(true);
    try { await putRace(road.race.id, { peakKm: next }); setValue(next != null ? String(fmt.distNum(next)) : ""); onChanged?.(); } finally { setBusy(false); }
  };
  const typed = Number(value.replace(",", "."));
  const typedKm = value && Number.isFinite(typed) && typed > 0 ? Math.round(fmt.fromUser(typed) * 10) / 10 : null;
  return (
    <div className="space-y-1.5 rounded-lg bg-muted px-3 py-2 text-sm">
      <div className="font-medium">{t("road.cap.title")}</div>
      <p className="text-xs text-muted-foreground">{km != null ? t("road.cap.set", { km: fmt.dist(km, 0) }) : t("road.cap.none")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input inputMode="decimal" className="h-8 w-24" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("road.cap.title")} placeholder={suggestedKm != null ? String(fmt.distNum(suggestedKm)) : fmt.unit} />
        <Button variant="outline" className="h-8" disabled={busy || typedKm == null || typedKm === km} onClick={() => save(typedKm)}>{t("common.save")}</Button>
        {suggestedKm != null && suggestedKm !== km && (
          <Button variant="outline" className="h-8" disabled={busy} onClick={() => save(suggestedKm)}>{t("road.cap.use", { km: fmt.dist(suggestedKm, 0) })}</Button>
        )}
        {km != null && <Button variant="ghost" className="h-8" disabled={busy} onClick={() => save(null)}>{t("road.cap.clear")}</Button>}
      </div>
      {suggestedKm != null && <p className="text-xs text-muted-foreground">{t("road.cap.suggest", { km: fmt.dist(suggestedKm, 0), peak: fmt.dist(provenKm, 0) })}</p>}
    </div>
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
      await putRace(road.race.id, { goalSeconds: s.suggestedSeconds });
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
