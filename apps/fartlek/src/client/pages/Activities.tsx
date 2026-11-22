import { SameSessionCard } from "../samesession";
import { RaceBadge, RaceQuestion } from "../raceresults";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, useAction, useApi } from "../http";
import { useFmt, useSettings } from "../prefs";
import { Badge, BarChart, BusyButton, Button, Card, CardTitle, EmptyState, ErrorText, Field, Input, Select, Spinner, Stat, Textarea } from "../ui";
import { EasyBadge, fmtDay, painArea } from "../bits";
import { t } from "../i18n";
import type { ActivityDetail, ActivityRow } from "../types";
import { Curves } from "../curves";
import { PlannedCard, stepBands } from "../stepresults";
import { fmtDuration } from "@/shared/format";
import { PAIN_AREAS, type PainEntry } from "@/shared/types";
import type { ActivityLog } from "@/shared/activitylog";

function PainChips({ pain }: { pain: PainEntry[] }) {
  return <>{pain.map((p) => <Badge key={p.id} tone={p.level >= 5 ? "danger" : "warning"} >{painArea(p.area)} {p.level}/10</Badge>)}</>;
}

export function Activities() {
  const fmt = useFmt();
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async (offset: number) => {
    setLoading(true);
    try {
      const r = await api<{ items: ActivityRow[]; more: boolean }>(`/activities?limit=30&offset=${offset}`);
      setItems((prev) => (offset ? [...prev, ...r.items] : r.items));
      setMore(r.more);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { void load(0); }, []);
  const flag = useAction((id: string, f: boolean) => api(`/activities/${encodeURIComponent(id)}/flag`, { body: { flag: f } }), () => load(0));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("nav.activities")}</h1>
      <ErrorText>{error ?? flag.error}</ErrorText>
      {!loading && !items.length && <EmptyState title={t("activities.emptyTitle")}>{t("activities.emptyText")}</EmptyState>}
      {items.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <Link to={`/activities/${encodeURIComponent(a.id)}`} className="min-w-0 basis-full hover:underline sm:flex-1 sm:basis-0">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDay(a.date)} · {a.typeKey.replace(/_/g, " ")}</div>
                </Link>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                  {a.isRun && <span className="w-16 text-right">{fmt.dist(a.distanceM / 1000)}</span>}
                  <span className="w-12 text-right text-muted-foreground">{fmtDuration(a.durationS)}</span>
                  {a.isRun && <span className="w-20 text-right text-muted-foreground">{fmt.pace(a.durationS / (a.distanceM / 1000))}</span>}
                  <span className="w-14 text-right text-muted-foreground">{a.avgHr ? `${Math.round(a.avgHr)} bpm` : ""}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.isRun && !a.thresholdFlag && <EasyBadge score={a.easyScore} />}
                  <Badge title={t("load.by", { method: t(`load.method.${a.load.method}`) })}>{t("load.badge", { load: a.load.load })}</Badge>
                  <PainChips pain={a.pain} />
                  {a.isRun && (
                    a.thresholdFlag
                      ? <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => flag.run(a.id, false)}>{t("threshold.title")} ✓</Button>
                      : <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => flag.run(a.id, true)}>{a.suggestedThreshold ? t("activity.flagSuggested") : t("activity.flag")}</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {loading && <div className="flex items-center gap-2 text-muted-foreground"><Spinner /> {t("common.loading")}…</div>}
      {more && !loading && <Button variant="outline" onClick={() => load(items.length)}>{t("activities.loadMore")}</Button>}
    </div>
  );
}

export function ActivityPage() {
  const { id = "" } = useParams();
  const { data, error, reload } = useApi<ActivityDetail>(`/activities/${encodeURIComponent(id)}`);
  const fmt = useFmt();
  const { settings } = useSettings();
  const flag = useAction((f: boolean) => api(`/activities/${encodeURIComponent(id)}/flag`, { body: { flag: f } }), reload);
  const retry = useAction(() => api(`/activities/${encodeURIComponent(id)}/detail`, { method: "POST" }), reload);
  const delPain = useAction((pid: number) => api(`/pain/${pid}`, { method: "DELETE" }), reload);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <div className="flex items-center gap-2 text-muted-foreground"><Spinner /> {t("common.loading")}…</div>;
  const a = data.activity;
  const pace = a.distanceM > 0 ? a.durationS / (a.distanceM / 1000) : null;
  const zs = data.metrics.zoneSecs;
  const zTotal = zs ? zs.reduce((x, y) => x + y, 0) : 0;
  const toElev = (m: number) => (fmt.units === "imperial" ? m * 3.28084 : m);
  const elevText = (m: number) => `${Math.round(toElev(m))} ${fmt.units === "imperial" ? "ft" : "m"}`;
  const lapCad = data.laps.some((l) => l.cadence != null);
  const lapElev = data.laps.some((l) => l.elevGain != null || l.elevLoss != null);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/activities" className="text-sm text-muted-foreground hover:underline">← {t("nav.activities")}</Link>
          <h1 className="text-2xl font-semibold">{a.name}</h1>
          <p className="text-sm text-muted-foreground">{fmtDay(a.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {a.startTimeLocal.slice(11, 16)} · {a.typeKey.replace(/_/g, " ")}</p>
          {data.race && <div className="mt-1.5"><RaceBadge race={data.race} /></div>}
        </div>
        {a.isRun && (
          <BusyButton variant={a.thresholdFlag ? "ghost" : "outline"} busy={flag.busy} busyLabel={`${t("activity.fetchingLaps")}…`} onClick={() => flag.run(!a.thresholdFlag)}>
            {a.thresholdFlag ? t("activity.unflag") : data.suggestedThreshold ? t("activity.flagSuggested") : t("activity.flag")}
          </BusyButton>
        )}
      </header>
      <ErrorText>{flag.error ?? retry.error ?? delPain.error}</ErrorText>
      {data.candidate && <RaceQuestion activityId={a.id} candidate={data.candidate} avgHr={a.avgHr} thresholdHr={data.estimate?.hr ?? null} onDone={reload} />}

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("stat.distance")} value={a.distanceM ? fmt.dist(a.distanceM / 1000, 2) : "–"}
          sub={a.elevationGain != null ? t("activity.elevSub", { elev: elevText(a.elevationGain) }) : undefined} />
        <Stat label={t("stat.time")} value={fmtDuration(a.durationS)} />
        <Stat label={t("stat.pace")} value={a.isRun ? fmt.pace(pace) : "–"}
          sub={data.avgCadence != null ? t("activity.cadenceSub", { spm: data.avgCadence }) : undefined} />
        <Stat label={t("stat.avgMaxHr")} value={a.avgHr ? `${Math.round(a.avgHr)} / ${a.maxHr ? Math.round(a.maxHr) : "–"}` : "–"} />
        <Stat label={t("load.title")} value={data.metrics.load.load} sub={data.metrics.trimp != null ? `${t(`load.method.${data.metrics.load.method}`)} · TRIMP ${data.metrics.trimp}` : t(`load.method.${data.metrics.load.method}`)} />
        <Stat label={t("easy.score")} value={data.metrics.easyScore != null && !a.thresholdFlag ? `${Math.round(data.metrics.easyScore * 100)}%` : "–"}
          sub={settings.easyHigh ? t("easy.atOrBelow", { hr: settings.easyHigh }) : t("easy.zones12")} />
      </Card>

      {data.detailStatus === "failed" && (
        <Card className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{t("activity.fitFailed", { error: data.detailError ?? "" })}</span>
          <BusyButton variant="outline" busy={retry.busy} onClick={() => retry.run()}>{t("common.tryAgain")}</BusyButton>
        </Card>
      )}
      {data.detailStatus === "none" && a.isRun && <p className="text-sm text-muted-foreground">{t("activity.detailPending")}</p>}

      {data.planned?.match && (
        <PlannedCard activityId={a.id} planned={data.planned} lapStarts={data.laps.map((l) => l.startS ?? null)} onChange={reload} />
      )}
      {data.planned?.match?.ok && <SameSessionCard activityId={a.id} />}

      {data.series.length > 0 && (
        <Card data-tour="activity-curves">
          <CardTitle>{t("activity.curves")}</CardTitle>
          <Curves series={data.series} bands={stepBands(data.planned?.match)} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.histogram.length > 0 && (
          <Card>
            <CardTitle>{t("activity.timeAtHr")}</CardTitle>
            <BarChart height={180} valueLabel={t("activity.minutes")} yFormat={(v) => `${Math.round(v)}m`}
              bars={data.histogram.map((h) => ({
                key: String(h.bpm), label: String(h.bpm), value: h.secs / 60,
                tip: <><div className="font-medium">{h.bpm}–{h.bpm + 4} bpm</div><div>{fmtDuration(h.secs)}</div></>,
              }))} />
            {data.bandPace && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("activity.inBand", { low: settings.easyLow ?? "", high: settings.easyHigh ?? "", time: fmtDuration(data.bandPace.secs), pace: fmt.pace(data.bandPace.pace), hr: Math.round(data.bandPace.hr) })}
              </p>
            )}
          </Card>
        )}
        {zs && zTotal > 0 && (
          <Card>
            <CardTitle>{settings.zones ? t("activity.zonesYours") : t("activity.zonesWatch")}</CardTitle>
            <ul className="space-y-1.5">
              {zs.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-xs text-muted-foreground">Z{i + 1}</span>
                  <div className="h-3 flex-1 rounded bg-muted"><div className="h-3 rounded" style={{ width: `${(s / zTotal) * 100}%`, background: `var(--seq-${i < 2 ? 1 : i < 3 ? 2 : 3})` }} /></div>
                  <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{Math.round((s / zTotal) * 100)}% · {fmtDuration(s)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {data.laps.length > 0 && (
        <Card className="overflow-x-auto">
          <CardTitle>{t("activity.laps")} {a.thresholdFlag && data.estimate?.paceSecPerKm && <span className="font-normal text-muted-foreground">· {t("activity.inRange", { from: fmt.pace(data.estimate.paceSecPerKm - 15), to: fmt.pace(data.estimate.paceSecPerKm + 20) })}</span>}</CardTitle>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1 pr-3">#</th><th className="pr-3">{t("stat.distance")}</th><th className="pr-3">{t("stat.time")}</th><th className="pr-3">{t("stat.pace")}</th><th className="pr-3">{t("stat.hr")}</th>
                {lapCad && <th className="pr-3">{t("stat.cadence")}</th>}{lapElev && <th className="pr-3">{t("stat.elevation")}</th>}<th /></tr>
            </thead>
            <tbody>
              {data.laps.map((l) => (
                <tr key={l.index} className={l.isInterval ? "font-medium" : "text-muted-foreground"}>
                  <td className="py-1 pr-3">{l.index + 1}</td>
                  <td className="pr-3">{fmt.dist(l.distanceM / 1000, 2)}</td>
                  <td className="pr-3">{fmtDuration(l.durationS)}</td>
                  <td className="pr-3">{fmt.pace(l.pace)}</td>
                  <td className="pr-3">{l.avgHr ? Math.round(l.avgHr) : "–"}</td>
                  {lapCad && <td className="pr-3">{l.cadence ?? "–"}</td>}
                  {lapElev && <td className="whitespace-nowrap pr-3">{l.elevGain != null || l.elevLoss != null ? `+${Math.round(toElev(l.elevGain ?? 0))} / −${elevText(l.elevLoss ?? 0)}` : "–"}</td>}
                  <td>{l.isInterval && <Badge tone={l.range === "in" ? "success" : l.range ? "warning" : "neutral"}>{l.range === "in" ? `${t("activity.interval")} · ${t("activity.rangeIn")}` : l.range ? `${t("activity.interval")} · ${t(`activity.range.${l.range}`)}` : t("activity.interval")}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <CardTitle>{t("log.title")}</CardTitle>
        <LogForm key={`${a.id}:${JSON.stringify(data.log)}`} activityId={a.id} log={data.log} metrics={data.logMetrics} onSaved={reload} />
      </Card>

      {data.durability && (
        <Card>
          <CardTitle>{t("durability.title")}</CardTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("durability.drift")} value={`${data.durability.driftPct > 0 ? "+" : ""}${data.durability.driftPct}%`}
              sub={t("durability.driftSub")} tone={data.durability.driftPct >= 5 ? "warning" : undefined} />
            {data.durability.thirds.map((third, i) => (
              <Stat key={i} label={[t("durability.first"), t("durability.middle"), t("durability.last")][i]} value={fmt.pace(third.pace)} sub={`${third.hr} bpm`} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("durability.activityHint")}
          </p>
        </Card>
      )}

      {a.isRun && (
        <Card>
          <CardTitle>{t("pain.title")}</CardTitle>
          {data.pain.length ? (
            <ul className="mb-3 space-y-1">
              {data.pain.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span><PainChips pain={[p]} /> {p.note && <span className="text-muted-foreground">{p.note}</span>}</span>
                  <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => delPain.run(p.id)}>{t("common.remove")}</Button>
                </li>
              ))}
            </ul>
          ) : <p className="mb-3 text-sm text-muted-foreground">{t("pain.none")}</p>}
          <PainForm activityId={a.id} date={a.date} onSaved={reload} />
        </Card>
      )}
    </div>
  );
}

const SCALE = Array.from({ length: 11 }, (_, i) => i);

function ScaleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">–</option>
      {SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
    </Select>
  );
}

function LogForm({ activityId, log, metrics, onSaved }: {
  activityId: string; log: ActivityLog; metrics: { srpe: number | null; gPerH: number | null; gi: number | null }; onSaved: () => void;
}) {
  const str = (v: number | null) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    note: log.note ?? "", rpe: str(log.rpe), carbsG: str(log.carbsG),
    nausea: str(log.nausea), bloating: str(log.bloating), cramps: str(log.cramps), feel: str(log.feel),
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = useAction(
    () => api(`/activities/${encodeURIComponent(activityId)}/log`, { method: "PUT", body: { ...f, carbsG: f.carbsG === "" ? null : Number(f.carbsG) } }),
    onSaved,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t("log.effort")} hint={metrics.srpe != null ? t("log.effortLoad", { load: metrics.srpe }) : t("log.effortHint")}>
          <ScaleSelect value={f.rpe} onChange={set("rpe")} />
        </Field>
        <Field label={t("log.carbs")} hint={metrics.gPerH != null ? `${metrics.gPerH} g/h` : t("log.carbsHint")}>
          <Input type="number" min={0} max={1500} value={f.carbsG} onChange={(e) => set("carbsG")(e.target.value)} />
        </Field>
        <Field label={t("log.feel")} hint={t("log.feelHint")}><ScaleSelect value={f.feel} onChange={set("feel")} /></Field>
        <div />
        <Field label={t("log.nausea")}><ScaleSelect value={f.nausea} onChange={set("nausea")} /></Field>
        <Field label={t("log.bloating")}><ScaleSelect value={f.bloating} onChange={set("bloating")} /></Field>
        <Field label={t("log.cramps")}><ScaleSelect value={f.cramps} onChange={set("cramps")} /></Field>
        {/* "–" means not rated; the gut-training advice needs a rating, and 0 is "no trouble at all". */}
        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-span-4">
          <Button variant="outline" className="h-8" onClick={() => setF((x) => ({ ...x, nausea: "0", bloating: "0", cramps: "0" }))}>{t("log.noGi")}</Button>
          <span>{t("log.giHint")}</span>
        </div>
      </div>
      <Field label={t("session.notes")}><Textarea rows={3} maxLength={1000} value={f.note} onChange={(e) => set("note")(e.target.value)} placeholder={t("common.optional").toLowerCase()} /></Field>
      <div className="flex items-center gap-3">
        <BusyButton variant="outline" busy={save.busy} onClick={() => save.run()}>{t("log.save")}</BusyButton>
        <span className="text-xs text-muted-foreground">{t("log.emptyRemoves")}</span>
      </div>
      <ErrorText>{save.error}</ErrorText>
    </div>
  );
}

function PainForm({ activityId, date, onSaved }: { activityId: string; date: string; onSaved: () => void }) {
  const [area, setArea] = useState<string>("knee");
  const [level, setLevel] = useState("2");
  const [note, setNote] = useState("");
  const save = useAction(() => api("/pain", { body: { activityId, date, area, level: Number(level), note: note || null } }), () => { setNote(""); onSaved(); });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
        <Field label={t("pain.area")}><Select value={area} onChange={(e) => setArea(e.target.value)}>{PAIN_AREAS.map((p) => <option key={p} value={p}>{painArea(p)}</option>)}</Select></Field>
        <Field label={t("pain.level")}><Input type="number" min={0} max={10} value={level} onChange={(e) => setLevel(e.target.value)} /></Field>
        <Field label={t("target.note")}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("common.optional").toLowerCase()} /></Field>
        <BusyButton variant="outline" busy={save.busy} onClick={() => save.run()}>{t("pain.log")}</BusyButton>
      </div>
      <ErrorText>{save.error}</ErrorText>
    </div>
  );
}
