/**
 * One day, read mode first: a header with the date, the route and the driving time, then the day as a timeline
 * (start, vias, stops, night). Tapping a stop, via or the night opens it in place for live editing.
 */
import { useRef, useState } from "react";
import type { PlanResponse } from "@/shared/api";
import { dayRouteUrl, weatherLink } from "@/shared/links";
import { dayDate, dayStart, formatDuration, LONG_DAY_MINUTES, parseDuration, sleepPoint, stopNumbers, type Home, type RoutePoint } from "@/shared/plan";
import { errorMessage, invalidateScopes } from "../api";
import { openAdd } from "../addSheet";
import { useAction } from "../hooks";
import { useTrip } from "../trip";
import { fmtDate } from "../plan";
import { Badge, Button, cn, ErrorText, IconButton } from "../ui";
import { AutoInput, Sign } from "./bits";
import { uploadPhoto } from "./Cover";
import { SleepBlock } from "./SleepBlock";
import { StopCard, StopPanel, ViaRow } from "./Stop";
import { t, tn } from "../i18n";

/** Label for a route point; the device's own location has no name of its own. */
export function pointLabel(p: RoutePoint): string {
  if (p.label) return p.label;
  if (p.kind === "start") return t("start.myLocation");
  if (p.kind === "night") return t("night.default");
  return "?";
}

const fmtDrive = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? t("est.h", { h }) : "", m ? t("est.min", { m }) : ""].filter(Boolean).join(" ") || t("est.min", { m: 0 });
};

/** Rail column of the timeline: a fixed-width cell that keeps markers on one vertical line. */
const Rail = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("relative z-10 flex w-11 shrink-0 justify-center", className)}>{children}</span>
);

export function DayView({ plan, di, home, highlight }: { plan: PlanResponse; di: number; home: Home | null; highlight: number | null }) {
  const day = plan.days[di];
  const [open, setOpen] = useState<number | "night" | null>(null);
  const date = dayDate(plan.startDate, di);
  const start = dayStart(plan, di, home);
  const night = sleepPoint(plan, day);
  const real = day.stops.filter((s) => s.kind === "stop");
  const end = night ?? (day.stops.length ? { ...start, label: day.stops[day.stops.length - 1].name } : null);
  const fromTo = end ? t("day.fromTo", { from: pointLabel(start), to: pointLabel(end) }) : pointLabel(start);
  const todos = real.flatMap((s) => s.todos);
  const done = todos.filter((x) => x.done).length;
  const numbers = stopNumbers(plan, di);
  const route = dayRouteUrl(plan, di, home);
  const weather = weatherLink(plan, di);
  const toggle = (id: number | "night") => setOpen((o) => (o === id ? null : id));

  return (
    <div className="space-y-4">
      <section className="space-y-2.5 rounded-lg border border-border bg-card p-4">
        {day.photoUrl && <img src={day.photoUrl} alt={t("cover.alt", { title: day.title || fromTo })} className="-mx-4 -mt-4 mb-1 block h-32 w-[calc(100%+2rem)] max-w-none rounded-t-lg object-cover" />}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{date ? fmtDate(date) : t("day.n", { n: di + 1 })}</span>
          {todos.length > 0 && <span className="text-xs text-muted-foreground">{t("day.doneCount", { done, total: todos.length })}</span>}
        </div>
        <h2 className="break-words text-xl font-extrabold leading-tight">{day.title || fromTo}</h2>
        {day.title && <p className="text-sm text-muted-foreground">{fromTo}</p>}
        <DriveTime dayId={day.id} minutes={day.driveMinutes} />
        <DayOptions plan={plan} di={di} />
      </section>

      <ol className="relative space-y-1 before:absolute before:bottom-6 before:left-[21px] before:top-5 before:w-px before:bg-border">
        <li className="flex min-h-11 items-center gap-3">
          <Rail><span className="size-3 rounded-full bg-primary" /></Rail>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-bold">{pointLabel(start)}</span>
            <span className="text-xs text-muted-foreground">{t("timeline.start")}</span>
          </span>
        </li>

        {day.stops.map((s, si) => (
          <li key={s.id} className={cn("flex gap-3", s.kind === "via" && open !== s.id ? "items-center" : "items-start py-1")}>
            {s.kind === "via" ? (
              <Rail className={open === s.id ? "pt-4" : ""}><span className="size-2.5 rounded-full border-2 border-muted-foreground bg-background" /></Rail>
            ) : (
              <Rail className="pt-3"><Sign label={t("stop.sign", { n: numbers[si]! })} className="h-8 min-w-9 px-1.5 text-lg">{numbers[si]}</Sign></Rail>
            )}
            {open === s.id ? (
              <StopPanel plan={plan} stop={s} no={null} dayIndex={di} onClose={() => setOpen(null)} />
            ) : s.kind === "via" ? (
              <ViaRow stop={s} onOpen={() => toggle(s.id)} />
            ) : (
              <StopCard stop={s} no={numbers[si]!} date={date} highlight={highlight === s.id} onOpen={() => toggle(s.id)} />
            )}
          </li>
        ))}

        <li className="flex min-h-11 items-center gap-3">
          <Rail><span aria-hidden className="flex size-6 items-center justify-center rounded-full border border-dashed border-border bg-background text-muted-foreground">+</span></Rail>
          <button type="button" onClick={() => openAdd("stop")} className="text-sm font-semibold text-primary">{t("day.addHere")}</button>
        </li>

        <li className="flex items-start gap-3 pt-1">
          <Rail className="pt-3 text-tent"><TentIcon /></Rail>
          {open === "night" ? (
            <div className="min-w-0 flex-1 space-y-2">
              <SleepBlock day={day} n={di + 1} area={plan.area} />
              <Button variant="ghost" className="h-9" onClick={() => setOpen(null)}>{t("stop.collapse")}</Button>
            </div>
          ) : (
            <button type="button" id={`day-${day.id}`} onClick={() => toggle("night")} className={cn("min-w-0 flex-1 rounded-lg border-2 border-tent p-3 text-left", highlight === day.id && "ring-2 ring-primary")}>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-tent">{t("night.n", { n: di + 1 })}</span>
              {day.sleep.name
                ? <span className="block break-words text-base font-bold">{day.sleep.name}</span>
                : <span className="block text-base font-semibold text-muted-foreground">{t("night.where")}</span>}
              <span className="block text-xs text-muted-foreground">{[t(`sleep.${day.sleep.type}`), day.sleep.note].filter(Boolean).join(" · ")}</span>
            </button>
          )}
        </li>
      </ol>

      <div className="flex gap-2">
        {route && <a className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90" href={route} target="_blank" rel="noopener noreferrer">{t("day.route")}</a>}
        {weather && <a className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-semibold hover:border-primary" href={weather.url} target="_blank" rel="noopener noreferrer">{weather.kind === "yr" ? t("day.weatherYr") : t("day.weather")}</a>}
      </div>
    </div>
  );
}

function TentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-6">
      <path d="M3 20h18M12 4 4 20M12 4l8 16M9 20l3-6 3 6" />
    </svg>
  );
}

/** Driving time typed in from Google Maps: a chip in read mode, a field when tapped. Long days get a gentle note. */
function DriveTime({ dayId, minutes }: { dayId: number; minutes: number | null }) {
  const { call } = useTrip();
  const [editing, setEditing] = useState(false);
  const { run, error, setError } = useAction();
  const save = (v: string) => {
    const m = parseDuration(v);
    if (m === undefined) return setError(t("drive.invalid"));
    void run(async () => { await call("PATCH", `/days/${dayId}`, { driveMinutes: m }, ["plan"]); setEditing(false); });
  };
  if (editing) {
    return (
      <div className="space-y-1">
        <label className="block space-y-1">
          <span className="text-xs font-semibold">{t("drive.label")}</span>
          <AutoInput value={formatDuration(minutes)} onSave={save} placeholder={t("drive.placeholder")} inputMode="numeric" autoFocus className="h-10 max-w-40" />
        </label>
        <p className="text-xs text-muted-foreground">{t("drive.hint")}</p>
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {minutes != null ? (
        <button type="button" onClick={() => setEditing(true)} aria-label={t("drive.edit")} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-sm font-semibold tabular-nums">
          <CarIcon />{fmtDrive(minutes)}
        </button>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-sm text-muted-foreground">
          <CarIcon />{t("drive.add")}
        </button>
      )}
      {minutes != null && minutes > LONG_DAY_MINUTES && <Badge tone="warning">{t("drive.long")}</Badge>}
    </div>
  );
}

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4">
      <path d="M5 17h14M6 17l1.5-6h9L18 17M7 13h10" /><circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" />
    </svg>
  );
}

/** Rarely used: rename, reorder, cover photo, delete. Folded away so the day reads cleanly. */
function DayOptions({ plan, di }: { plan: PlanResponse; di: number }) {
  const { call, base, tid } = useTrip();
  const day = plan.days[di];
  const { run, busy, error, setError } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const move = (dir: -1 | 1) => void run(() => call("POST", `/days/${day.id}/move`, { dir }, ["plan"]));
  const remove = () => {
    if (confirm(tn("day.confirmDelete", day.stops.length))) void run(() => call("DELETE", `/days/${day.id}`, undefined, ["plan"]));
  };
  const photo = async (file: File | undefined) => {
    if (!file) return;
    try { await uploadPhoto(base, `/days/${day.id}/photo`, file); invalidateScopes(tid, ["plan"]); } catch (e) { setError(t("cover.failed", { reason: errorMessage(e) })); }
  };
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">{t("day.options")} <span className="inline-block transition group-open:rotate-90">›</span></summary>
      <div className="mt-3 space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-semibold">{t("day.titleLabel")}</span>
          <AutoInput value={day.title} onSave={(v) => void run(() => call("PATCH", `/days/${day.id}`, { title: v }, ["plan"]))} placeholder={t("day.titlePlaceholder")} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label={t("day.moveUp")} disabled={di === 0 || busy} onClick={() => move(-1)}>↑</IconButton>
          <IconButton label={t("day.moveDown")} disabled={di === plan.days.length - 1 || busy} onClick={() => move(1)}>↓</IconButton>
          <Button variant="outline" className="h-9" onClick={() => input.current?.click()}>{day.photoUrl ? t("cover.replace") : t("cover.add")}</Button>
          {day.photoUrl && <Button variant="ghost" className="h-9" onClick={() => void run(() => call("DELETE", `/days/${day.id}/photo`, undefined, ["plan"]))}>{t("cover.remove")}</Button>}
          <Button variant="ghost" className="ml-auto h-9 text-danger" disabled={busy} onClick={remove}>{t("day.delete")}</Button>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void photo(f); }} />
        <ErrorText>{error}</ErrorText>
      </div>
    </details>
  );
}
