import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { PlanResponse, QuickResponse, UpdatePlanBody } from "@/shared/api";
import { tripRouteUrl } from "@/shared/links";
import { dayDate, PLACES, START_MODES, startPoint, tripStats, type Home, type StartMode } from "@/shared/plan";
import { useAction } from "../hooks";
import { useTrip } from "../trip";
import { fmtDate, fmtKm, fmtShortDate, useCurrentDay, usePlan } from "../plan";
import { Button, Card, cn, ErrorText, Field, Input, SegmentedControl, Textarea, PageSkeleton } from "../ui";
import { Eyebrow } from "../components/bits";
import { DayView } from "../components/DayView";
import { PageHeader } from "../components/common";
import { t, tn } from "../i18n";

export function Days() {
  const { detail } = useTrip();
  const q = usePlan();
  if (!q.data) return q.error ? <ErrorText>{q.error.message}</ErrorText> : <PageSkeleton cards={3} columns="" />;
  return (
    <div className="space-y-4">
      <PageHeader title={detail.name} />
      <Planner plan={q.data} home={detail.home} />
      <TripPlanning plan={q.data} home={detail.home} />
    </div>
  );
}

/** Start, date, quick entry and the whole route: used while planning, so folded below the day. ?quick=1 opens it. */
function TripPlanning({ plan, home }: { plan: PlanResponse; home: Home }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const { idx, select } = useCurrentDay(plan);
  const wantQuick = params.get("quick") === "1";
  useEffect(() => {
    if (!wantQuick) return;
    setOpen(true);
    setParams((p) => { p.delete("quick"); return p; }, { replace: true });
    requestAnimationFrame(() => {
      const el = document.getElementById("quick-entry");
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    });
  }, [wantQuick, setParams]);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
        <span>
          <span className="block text-sm font-semibold">{t("plan.trip")}</span>
          <span className="block text-xs text-muted-foreground">{t("plan.tripHint")}</span>
        </span>
        <span aria-hidden className="text-muted-foreground transition group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-4 px-4 pb-4">
        <StartCard plan={plan} home={home} />
        <QuickEntry dayId={plan.days[idx].id} n={idx + 1} onDay={select} />
        <Summary plan={plan} home={home} />
      </div>
    </details>
  );
}

function StartCard({ plan, home }: { plan: PlanResponse; home: Home }) {
  const { call } = useTrip();
  const { run, error } = useAction();
  const [text, setText] = useState(plan.startText);
  const save = (body: UpdatePlanBody) => void run(() => call("PATCH", "/plan", body, ["plan"]));
  const sp = startPoint(plan, home);
  const note =
    sp.missing === "here" ? t("start.hereNote")
    : sp.missing === "home" ? t("start.noHome")
    : sp.missing === "position" ? t("start.noPosition")
    : "";
  return (
    <Card className="space-y-3">
      <Eyebrow>{t("start.title")}</Eyebrow>
      <SegmentedControl<StartMode>
        value={plan.startMode} onChange={(v) => save({ startMode: v })} className="flex w-full"
        options={START_MODES.map((m) => ({ value: m, label: m === "home" && home.label ? home.label : t(`start.${m}`) }))}
      />
      {plan.startMode === "custom" && (
        <Field label={t("start.customLabel")}>
          <Input
            value={text} list="etapp-places" placeholder={t("start.customPlaceholder")}
            onChange={(e) => setText(e.target.value)} onBlur={() => { if (text.trim() !== plan.startText) save({ startText: text.trim() }); }}
          />
          <datalist id="etapp-places">{Object.values(PLACES).map((p) => <option key={p.label} value={p.label} />)}</datalist>
        </Field>
      )}
      <Field label={t("start.date")}>
        <Input type="date" value={plan.startDate ?? ""} onChange={(e) => save({ startDate: e.target.value || null })} />
      </Field>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function Summary({ plan, home }: { plan: PlanResponse; home: Home }) {
  const s = tripStats(plan, home);
  const route = tripRouteUrl(plan, home);
  const first = dayDate(plan.startDate, 0), last = dayDate(plan.startDate, plan.days.length - 1);
  const range = first && last ? (plan.days.length > 1 ? t("summary.dateRange", { from: fmtDate(first), to: fmtDate(last) }) : fmtDate(first)) : "";
  const items = [
    tn("summary.days", s.days), tn("summary.stops", s.stops), t("summary.todos", { done: s.done, total: s.todos }),
    s.km > 0 ? `${t("summary.estimated", { km: fmtKm(s.km) })}${s.knownLegs < s.legs ? ` ${t("est.partial")}` : ""}` : "", range,
  ].filter(Boolean);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-muted-foreground">
        {items.map((x) => <span key={x}>{x}</span>)}
      </div>
      {route && <a className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90" href={route} target="_blank" rel="noopener noreferrer">{t("summary.wholeRoute")}</a>}
    </Card>
  );
}

function Planner({ plan, home }: { plan: PlanResponse; home: Home }) {
  const { call } = useTrip();
  const { idx, select, todayIdx } = useCurrentDay(plan);
  const [params, setParams] = useSearchParams();
  const [highlight, setHighlight] = useState<number | null>(null);
  const { run, busy } = useAction();

  // Arriving from the map with ?stop= or ?day=: open that day, highlight and scroll to it.
  const focusStop = Number(params.get("stop")) || null, focusDay = Number(params.get("day")) || null;
  useEffect(() => {
    if (!focusStop && !focusDay) return;
    const day = focusDay ? plan.days.find((d) => d.id === focusDay) : plan.days.find((d) => d.stops.some((s) => s.id === focusStop));
    if (day) select(day.id);
    const id = focusStop ?? focusDay;
    setHighlight(id);
    setParams((p) => { p.delete("stop"); p.delete("day"); return p; }, { replace: true });
    requestAnimationFrame(() => document.getElementById(focusStop ? `stop-${focusStop}` : `day-${focusDay}`)?.scrollIntoView({ block: "center" }));
  }, [focusStop, focusDay, plan.days, select, setParams]);

  const day = plan.days[idx];
  const addDay = () => void run(async () => {
    const { id } = await call<{ id: number }>("POST", "/days", {}, ["plan"]);
    select(id);
  });
  const go = (i: number) => { select(plan.days[i].id); window.scrollTo(0, 0); };

  return (
    <>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label={t("day.pick")}>
        {plan.days.map((d, i) => {
          const date = dayDate(plan.startDate, i);
          const on = i === idx;
          return (
            <button
              key={d.id} type="button" aria-pressed={on} onClick={() => select(d.id)}
              className={cn(
                "flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-md border px-3 py-1.5",
                on ? "border-primary bg-primary text-primary-foreground" : i === todayIdx ? "border-signature bg-card" : "border-border bg-card",
              )}
            >
              <b className="text-sm font-semibold leading-none">{t("day.n", { n: i + 1 })}</b>
              <span className={cn("min-h-4 text-[11px]", on ? "text-primary-foreground" : i === todayIdx ? "font-semibold text-signature-foreground" : "text-muted-foreground")}>
                {i === todayIdx ? t("day.today") : date ? fmtShortDate(date) : ""}
              </span>
            </button>
          );
        })}
        <button type="button" onClick={addDay} disabled={busy} aria-label={t("day.add")} className="flex min-w-12 shrink-0 items-center justify-center rounded-md border border-border bg-card text-xl">+</button>
      </div>
      <DayView key={day.id} plan={plan} di={idx} home={home} highlight={highlight} />
      <div className="flex justify-between gap-2">
        <Button variant="outline" disabled={idx === 0} onClick={() => go(idx - 1)}>{t("day.prev")}</Button>
        <Button variant="outline" disabled={idx === plan.days.length - 1} onClick={() => go(idx + 1)}>{t("day.next")}</Button>
      </div>
    </>
  );
}

function QuickEntry({ dayId, n, onDay }: { dayId: number; n: number; onDay: (id: number) => void }) {
  const { call } = useTrip();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => {
      const r = await call<QuickResponse>("POST", "/quick", { dayId, text }, ["plan"]);
      const what = [
        r.added.days ? tn("quick.days", r.added.days) : "", r.added.stops ? tn("quick.stops", r.added.stops) : "",
        r.added.vias ? tn("quick.vias", r.added.vias) : "",
        r.added.todos ? tn("quick.todos", r.added.todos) : "", r.added.nights ? tn("quick.nights", r.added.nights) : "",
      ].filter(Boolean);
      const warnings = r.warnings.map((w) => t(w.code === "shortLink" ? "quick.shortLink" : "quick.badLink", { line: w.line }));
      setMsg({ text: [what.length ? t("quick.added", { what: what.join(", ") }) : t("quick.nothing"), ...warnings].join(" "), warn: !what.length || warnings.length > 0 });
      if (what.length) setText("");
      if (r.dayId !== dayId) onDay(r.dayId);
    });
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <Eyebrow>{t("quick.title", { n })}</Eyebrow>
        <Textarea id="quick-entry" rows={3} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} placeholder={t("quick.placeholder")} aria-label={t("quick.title", { n })} className="min-h-24" />
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t("quick.howTo")}</summary>
          <p className="mt-1.5">{t("quick.help")}</p>
        </details>
        {msg && <p className={cn("text-sm", msg.warn ? "text-warning" : "text-success")}>{msg.text}</p>}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !text.trim()}>{t("quick.add")}</Button>
      </form>
    </Card>
  );
}
