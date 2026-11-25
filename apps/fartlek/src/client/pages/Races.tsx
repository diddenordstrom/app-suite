import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useAction, useApi } from "../http";
import { useFmt, useSettings } from "../prefs";
import { Badge, BusyButton, Button, Card, CardTitle, ErrorText, Field, InfoTip, Input, Select } from "../ui";
import { PredictionBody } from "../perf";
import { AnswerKey, PastRaces } from "../raceresults";
import { fmtCountdown, fmtDay } from "../bits";
import { t } from "../i18n";
import type { PlanData, RacePredictionData, RaceHintsData } from "../types";
import type { Race } from "@/shared/types";
import type { RaceHints } from "@/shared/blocks";
import { fmtClock, parseGoalTime } from "@/shared/format";
import { goalPace, neededThreshold, countdown } from "@/shared/recovery";
import { todayIn } from "@/shared/dates";

const PRESETS = [{ label: () => "5 km", km: 5 }, { label: () => "10 km", km: 10 }, { label: () => t("races.half"), km: 21.0975 }, { label: () => t("races.marathon"), km: 42.195 }];

export function Races() {
  const { settings } = useSettings();
  const today = todayIn(settings.timezone);
  const { data, error, reload } = useApi<PlanData>(`/plan?from=${today}&to=${today}`);
  const [editing, setEditing] = useState<Race | null>(null);
  const fmt = useFmt();
  const del = useAction((id: number) => api(`/races/${id}`, { method: "DELETE" }), () => { setEditing(null); reloadAll(); });
  const remove = (r: Race) => { if (window.confirm(t("races.confirmRemove", { name: r.name }))) void del.run(r.id); };
  const formRef = useRef<HTMLDivElement>(null);
  const edit = (r: Race) => { setEditing(r); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  // From the plan calendar: /plan/races?edit=<id> opens that race in the form.
  const [params, setParams] = useSearchParams();
  const editParam = Number(params.get("edit"));
  useEffect(() => {
    const r = editParam ? data?.races.find((x) => x.id === editParam) : undefined;
    if (!r) return;
    setEditing(r);
    setParams({}, { replace: true });
  }, [editParam, data, setParams]);
  const hints = useApi<RaceHintsData>("/races/hints");
  const preds = useApi<{ predictions: RacePredictionData[] }>("/races/predictions");
  const reloadAll = () => { void reload(); void hints.reload(); void preds.reload(); };
  const pred = (id: number) => preds.data?.predictions.find((p) => p.raceId === id) ?? null;
  const upcoming = data?.races.filter((r) => r.date >= today) ?? [];
  const past = data?.races.filter((r) => r.date < today).reverse() ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("races.title")}</h1>
        <Link to="/plan" className="text-sm text-muted-foreground hover:underline">← {t("nav.plan")}</Link>
      </header>
      <ErrorText>{error ?? del.error}</ErrorText>

      <div ref={formRef} className="scroll-mt-4"><Card>
        <CardTitle>{editing ? t("races.edit", { name: editing.name }) : t("races.add")}</CardTitle>
        <RaceForm key={editing?.id ?? "new"} race={editing} today={today} onDone={() => { setEditing(null); reloadAll(); }} onCancel={editing ? () => setEditing(null) : undefined} />
      </Card></div>

      <Card>
        <CardTitle>{t("races.upcoming")}</CardTitle>
        {upcoming.length ? (
          <ul className="divide-y divide-border">
            {upcoming.map((r) => {
              const gp = r.goalSeconds ? goalPace(r.goalSeconds, r.distanceKm) : null;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <div className="font-medium">{r.name} <Badge>{r.priority}</Badge> <Badge className="uppercase">{fmtCountdown(countdown(today, r.date))}</Badge></div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDay(r.date)} · {fmt.dist(r.distanceKm, 2)}
                      {gp && <> · {t("races.goal", { time: fmtClock(r.goalSeconds!) })} = {fmt.pace(gp)} · {t("races.needsThreshold", { pace: fmt.pace(neededThreshold(gp, r.distanceKm)) })}</>}
                    </div>
                    {hints.data?.hints[r.id] && <Hints h={hints.data.hints[r.id]} />}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => edit(r)}>{t("common.edit")}</Button>
                    <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => remove(r)}>{t("common.remove")}</Button>
                  </div>
                  {pred(r.id) && (
                    <div className="w-full" data-tour={r.id === upcoming[0]?.id ? "race-prediction" : undefined}>
                      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">{t("pred.title")}<InfoTip label={t("pred.title")}>{t("chartInfo.pred")}</InfoTip></div>
                      <PredictionBody pred={pred(r.id)!} goalSeconds={r.goalSeconds} distanceKm={r.distanceKm} />
                      {r.id === upcoming[0]?.id && <div className="mt-3"><AnswerKey races={data?.races ?? []} /></div>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{t("races.noneUpcoming")}</p>}
      </Card>

      <PastRaces races={past} today={today} showKey={!upcoming.some((r) => pred(r.id))} onChange={reloadAll} onEdit={edit} onRemove={remove} />

    </div>
  );
}

function RaceForm({ race, today, onDone, onCancel }: { race: Race | null; today: string; onDone: () => void; onCancel?: () => void }) {
  const fmt = useFmt();
  const [name, setName] = useState(race?.name ?? "");
  const [date, setDate] = useState(race?.date ?? "");
  const [dist, setDist] = useState(race ? String(Math.round(fmt.distNum(race.distanceKm) * 100) / 100) : String(fmt.distNum(42.195)));
  const [goal, setGoal] = useState(race?.goalSeconds ? fmtClock(race.goalSeconds) : "");
  const [priority, setPriority] = useState<Race["priority"]>(race?.priority ?? "A");
  const [result, setResult] = useState(race?.resultSeconds ? fmtClock(race.resultSeconds) : "");
  const [cap, setCap] = useState(race?.peakKm != null ? String(fmt.distNum(race.peakKm)) : "");
  // A race that has been run (or is run today) can have its official time corrected or cleared here.
  const hasResult = !!date && date <= today;
  const save = useAction(async () => {
    const goalSeconds = goal ? parseGoalTime(goal) : null;
    if (goal && goalSeconds == null) throw new Error(t("races.goalFormat"));
    const resultSeconds = hasResult && result ? parseGoalTime(result) : null;
    if (hasResult && result && resultSeconds == null) throw new Error(t("rr.timeFormat"));
    const raw = Number(dist.replace(",", "."));
    const distanceKm = PRESETS.find((p) => Math.abs(fmt.distNum(p.km) - raw) < 0.01)?.km ?? fmt.fromUser(raw);
    const capRaw = cap ? Number(cap.replace(",", ".")) : null;
    if (capRaw != null && !(capRaw > 0)) throw new Error(t("races.peakCapFormat"));
    const peakKm = capRaw != null ? Math.round(fmt.fromUser(capRaw) * 10) / 10 : null;
    const body = { name, date, distanceKm, goalSeconds, priority, peakKm: priority === "A" ? peakKm : null, ...(hasResult || race?.resultSeconds != null ? { resultSeconds } : {}) };
    if (race) await api(`/races/${race.id}`, { method: "PUT", body });
    else await api("/races", { body });
    if (!race) { setName(""); setDate(""); setGoal(""); setResult(""); setCap(""); }
  }, onDone);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("settings.name")}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Field label={t("common.date")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("session.distance", { unit: fmt.unit })}>
          <div className="flex gap-1">
            <Input inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} />
            {PRESETS.map((p) => <Button key={p.km} variant="outline" className="h-10 px-2 text-xs" onClick={() => setDist(String(Math.round(fmt.distNum(p.km) * 100) / 100))}>{p.label()}</Button>)}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("races.goalTime")} hint="3:30 / 1:35:00"><Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t("common.optional").toLowerCase()} /></Field>
          <Field label={t("races.priority")}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Race["priority"])}>
              <option value="A">A · {t("races.goalRace")}</option><option value="B">B</option><option value="C">C</option>
            </Select>
          </Field>
        </div>
        {priority === "A" && (
          <Field label={t("races.peakCap", { unit: fmt.unit })} hint={t("races.peakCapHint")}>
            <Input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={t("common.optional").toLowerCase()} />
          </Field>
        )}
        {hasResult && (
          <Field label={t("rr.time")} hint="1:38:12"><Input value={result} onChange={(e) => setResult(e.target.value)} placeholder={t("common.optional").toLowerCase()} className="tabular-nums" /></Field>
        )}
      </div>
      <div className="flex gap-2">
        <BusyButton busy={save.busy} disabled={!name || !date} onClick={() => save.run()}>{race ? t("common.save") : t("races.addButton")}</BusyButton>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
      </div>
      <ErrorText>{save.error}</ErrorText>
    </div>
  );
}

/** Taper suggestion (A races) and where 6–2 weeks out stands against the study bands. Hints, never pass/fail. */
function Hints({ h }: { h: RaceHints }) {
  const fmt = useFmt();
  if (!h.taper && !h.build) return null;
  const short = (d: string) => fmtDay(d, { day: "numeric", month: "short" });
  return (
    <div className="mt-2 space-y-1 rounded-md bg-muted px-3 py-2 text-xs">
      <div className="font-medium">{t("races.hintsTitle")}</div>
      {h.taper && (
        <p>{h.taper.lowKm != null
          ? t("races.taperKm", { from: short(h.taper.from), low: fmt.num(h.taper.lowKm), high: fmt.num(h.taper.highKm!), unit: fmt.unit })
          : t("races.taper", { from: short(h.taper.from) })}</p>
      )}
      {h.build && h.build.weeklyKm != null && (
        <p>
          {t("races.build", { km: fmt.num(h.build.weeklyKm), unit: fmt.unit, long: h.build.longestKm != null ? fmt.dist(h.build.longestKm) : "–" })}{" "}
          <span className="text-muted-foreground">
            {h.build.volume && t(`races.${h.build.kind}.volume.${h.build.volume}` as Parameters<typeof t>[0])}{" "}
            {h.build.long && t(`races.${h.build.kind}.long.${h.build.long}` as Parameters<typeof t>[0])}
          </span>
        </p>
      )}
      <p className="text-muted-foreground">{t("races.hintsNote")}</p>
    </div>
  );
}
