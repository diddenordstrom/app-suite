import { useState, type FormEvent } from "react";
import type { PlanDay, PlanResponse } from "@/shared/api";
import { dayRouteUrl, weatherLink } from "@/shared/links";
import { dayDate, dayPoints, dayStats, firstStopNumber, sleepPoint, type Home } from "@/shared/plan";
import { useAction } from "../hooks";
import { useTrip } from "../trip";
import { fmtDate, fmtDuration, fmtKm } from "../plan";
import { Button, cn, ErrorText, Field, IconButton, Input } from "../ui";
import { ChipButton, ChipLink, Chips, Sign } from "./bits";
import { Leg } from "./Leg";
import { readPosition, StopItem } from "./StopItem";
import { SleepBlock } from "./SleepBlock";
import { Cover } from "./Cover";
import { t, tn } from "../i18n";

export function DayCard({ plan, di, home, highlight }: { plan: PlanResponse; di: number; home: Home | null; highlight: number | null }) {
  const { call } = useTrip();
  const day = plan.days[di];
  const [editing, setEditing] = useState(false);
  const { run, busy, error } = useAction();
  const date = dayDate(plan.startDate, di);
  const stats = dayStats(plan, di, home);
  const title = day.title || (date ? fmtDate(date) : t("day.n", { n: di + 1 }));
  const sub = [
    day.title && date ? fmtDate(date) : "",
    stats.known ? `${t("est.driving", { km: fmtKm(stats.km), time: fmtDuration(stats.hours) })}${stats.known < stats.total ? ` ${t("est.partial")}` : ""} · ${t("est.estimated")}` : "",
  ].filter(Boolean).join(" · ");
  const pts = dayPoints(plan, di, home);
  const night = sleepPoint(plan, day);
  const route = dayRouteUrl(plan, di, home);
  const weather = weatherLink(plan, di);
  const no = firstStopNumber(plan, di);
  const move = (dir: -1 | 1) => void run(() => call("POST", `/days/${day.id}/move`, { dir }, ["plan"]));

  return (
    <article id={`day-${day.id}`} className={cn("space-y-3.5 rounded-lg border border-border bg-card p-3.5", highlight === day.id && "ring-2 ring-primary")}>
      <Cover day={day} title={title} />
      {editing ? (
        <DayEdit day={day} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-start gap-3">
          <Sign wide>{t("day.n", { n: di + 1 })}</Sign>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-xl font-semibold leading-tight">{title}</h3>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <IconButton label={t("day.moveUp")} disabled={di === 0 || busy} onClick={() => move(-1)}>↑</IconButton>
            <IconButton label={t("day.moveDown")} disabled={di === plan.days.length - 1 || busy} onClick={() => move(1)}>↓</IconButton>
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>

      <div className="space-y-2.5">
        {day.stops.length === 0 && <p className="text-sm text-muted-foreground">{t("day.empty")}</p>}
        {day.stops.map((s, si) => (
          <div key={s.id} className="space-y-2.5">
            <Leg from={pts[si]} to={pts[si + 1]} area={plan.area} />
            <StopItem
              stop={s} no={no + si} area={plan.area} date={date} highlight={highlight === s.id}
              first={di === 0 && si === 0} last={di === plan.days.length - 1 && si === day.stops.length - 1}
            />
          </div>
        ))}
        {night && <Leg from={pts[pts.length - 2]} to={pts[pts.length - 1]} area={plan.area} />}
      </div>

      <AddStop dayId={day.id} />
      <SleepBlock day={day} n={di + 1} area={plan.area} />

      <Chips>
        {route && <ChipLink href={route}>{t("day.route")}</ChipLink>}
        {weather && <ChipLink href={weather.url}>{weather.kind === "yr" ? t("day.weatherYr") : t("day.weather")}</ChipLink>}
        {!editing && <ChipButton onClick={() => setEditing(true)}>{t("day.edit")}</ChipButton>}
      </Chips>
    </article>
  );
}

function DayEdit({ day, onDone }: { day: PlanDay; onDone: () => void }) {
  const { call } = useTrip();
  const [title, setTitle] = useState(day.title);
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { await call("PATCH", `/days/${day.id}`, { title: title.trim() }, ["plan"]); onDone(); });
  };
  const remove = () => {
    if (confirm(tn("day.confirmDelete", day.stops.length))) void run(() => call("DELETE", `/days/${day.id}`, undefined, ["plan"]));
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t("day.titleLabel")}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("day.titlePlaceholder")} autoFocus /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{t("common.save")}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="button" variant="ghost" className="ml-auto text-danger" onClick={remove} disabled={busy}>{t("day.delete")}</Button>
      </div>
    </form>
  );
}

function AddStop({ dayId }: { dayId: number }) {
  const { call } = useTrip();
  const [name, setName] = useState("");
  const [pos, setPos] = useState("");
  const { run, busy, error, setError } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = readPosition(pos);
    if (p === "invalid") return setError(t("pos.invalid"));
    void run(async () => {
      await call("POST", `/days/${dayId}/stops`, { name: name.trim(), ...p }, ["plan"]);
      setName(""); setPos("");
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label={t("day.addStop")}><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("day.stopPlaceholder")} /></Field>
      <Field label={t("day.position")}><Input value={pos} onChange={(e) => setPos(e.target.value)} placeholder={t("day.positionPlaceholder")} inputMode="decimal" /></Field>
      <Button type="submit" variant="outline" disabled={busy || !name.trim()}>{t("day.addStopButton")}</Button>
      <div className="sm:col-span-3"><ErrorText>{error}</ErrorText></div>
    </form>
  );
}
