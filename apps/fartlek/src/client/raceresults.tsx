import { useState } from "react";
import { Link } from "react-router-dom";
import { missOf, type ModelCheck } from "../shared/racecheck";
import { fmtClock, parseGoalTime } from "../shared/format";
import type { Race } from "../shared/types";
import { fmtDay } from "./bits";
import { api, useAction, useApi } from "./http";
import { t, type MsgKey } from "./i18n";
import { useFmt } from "./prefs";
import { BusyButton, Button, Card, CardTitle, ErrorText, Field, Input, Select, cn } from "./ui";

/*
 * Races as the answer key for the predictions (docs/decisions/fartlek-race-results.md): the question on
 * a run, past races with their results, and what Fartlek said the day before each of them.
 */

export interface RaceCheckData {
  raceId: number; date: string; distanceKm: number; resultSeconds: number; predictedSeconds: number | null; model: string | null; models: ModelCheck[];
}
export interface ResultsData { checks: RaceCheckData[]; suggestions: { raceId: number; activityId: string; seconds: number }[] }
export interface RaceCandidate { reason: "garmin" | "effort"; distanceKm: number; seconds: number; name: string }

const DISTANCES = [{ key: "races.half", km: 21.0975 }, { key: null, km: 5 }, { key: null, km: 10 }, { key: "races.marathon", km: 42.195 }] as const;

/** "2:53 faster" / "41 s slower": the miss read against the result. */
export function diffText(predicted: number, result: number): { text: string; better: boolean } {
  const d = predicted - result;
  if (Math.abs(d) < 5) return { text: t("rr.spotOn"), better: true };
  const abs = Math.abs(d), s = abs < 60 ? `${abs} s` : fmtClock(abs);
  return d > 0 ? { text: t("rr.faster", { d: s }), better: true } : { text: t("rr.slower", { d: s }), better: false };
}

function useDistLabel() {
  const fmt = useFmt();
  return (km: number) => {
    const p = DISTANCES.find((x) => Math.abs(x.km - km) < 0.01 && x.key);
    return p?.key ? t(p.key as MsgKey) : fmt.dist(km, km % 1 ? 2 : 0);
  };
}

/* ---------- On a run: "Was this a race?" ---------- */

export function RaceQuestion({ activityId, candidate, avgHr, thresholdHr, onDone }: {
  activityId: string; candidate: RaceCandidate; avgHr: number | null; thresholdHr: number | null; onDone: () => void;
}) {
  const fmt = useFmt();
  const distLabel = useDistLabel();
  const [name, setName] = useState(candidate.name);
  const [time, setTime] = useState(fmtClock(candidate.seconds));
  const yes = useAction(async () => {
    const resultSeconds = parseGoalTime(time);
    if (resultSeconds == null) throw new Error(t("rr.timeFormat"));
    await api(`/activities/${encodeURIComponent(activityId)}/race`, { body: { name: name.trim(), distanceKm: candidate.distanceKm, resultSeconds } });
  }, onDone);
  const no = useAction(() => api(`/activities/${encodeURIComponent(activityId)}/not-race`, { body: {} }), onDone);
  const share = avgHr && thresholdHr ? Math.round((avgHr / thresholdHr) * 100) : null;
  return (
    <section aria-labelledby="race-q" className="space-y-3 rounded-lg border border-signature p-4" style={{ background: "color-mix(in srgb, var(--signature-soft) 45%, var(--card))" }}>
      <div className="flex items-start gap-3">
        <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-signature-foreground" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>
        <div className="space-y-1">
          <h2 id="race-q" className="text-[15px] font-semibold text-signature-foreground">{t("rr.question")}</h2>
          <p className="text-sm">{t(`rr.because.${candidate.reason}`, { dist: fmt.dist(candidate.distanceKm, 2), time: fmtClock(candidate.seconds), hr: avgHr != null ? Math.round(avgHr) : "–", share: share ?? "–" })}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label={t("rr.name")}><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("rr.time")}><Input value={time} onChange={(e) => setTime(e.target.value)} className="text-right tabular-nums" /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BusyButton busy={yes.busy} disabled={!name.trim()} onClick={() => yes.run()}>{t("rr.yes")}</BusyButton>
        <BusyButton variant="outline" busy={no.busy} onClick={() => no.run()}>{t("rr.no")}</BusyButton>
        <span className="text-xs text-muted-foreground">{t("rr.counts", { dist: distLabel(candidate.distanceKm) })}</span>
      </div>
      <ErrorText>{yes.error ?? no.error}</ErrorText>
    </section>
  );
}

/** On a run that is a race's result. */
export function RaceBadge({ race }: { race: Race }) {
  return (
    <Link to="/plan/races" className="inline-flex rounded-full bg-signature-soft px-2.5 py-0.5 text-xs font-medium text-signature-foreground hover:underline">
      {t("rr.isRace", { name: race.name, time: race.resultSeconds != null ? fmtClock(race.resultSeconds) : "–" })}
    </Link>
  );
}

/* ---------- Races page ---------- */

/** `showKey`: the answer key goes here when there is no upcoming race's prediction to put it under. */
export function PastRaces({ races, today, showKey, onChange, onEdit, onRemove }: {
  races: Race[]; today: string; showKey: boolean; onChange: () => void; onEdit: (r: Race) => void; onRemove: (r: Race) => void;
}) {
  const distLabel = useDistLabel();
  const { data, reload } = useApi<ResultsData>("/races/results");
  const [adding, setAdding] = useState(false);
  const [entering, setEntering] = useState<number | null>(null);
  const done = () => { setAdding(false); setEntering(null); void reload(); onChange(); };
  const checkOf = (id: number) => data?.checks.find((c) => c.raceId === id);
  const suggestionOf = (id: number) => data?.suggestions.find((s) => s.raceId === id);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("rr.past")}</CardTitle>
        {!adding && <Button variant="outline" className="h-9 px-3 text-sm" onClick={() => setAdding(true)}>{t("rr.addPast")}</Button>}
      </div>
      {!races.length && !adding && <p className="text-sm text-muted-foreground">{t("rr.nonePast")}</p>}
      {races.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {races.map((r) => {
            const c = checkOf(r.id), sug = suggestionOf(r.id);
            const d = c?.predictedSeconds != null ? diffText(c.predictedSeconds, c.resultSeconds) : null;
            return (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 tabular-nums sm:grid-cols-[6rem_minmax(0,1fr)_6rem_10rem]">
                <span className="hidden text-xs text-muted-foreground sm:block">{fmtDay(r.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="min-w-0">
                  {r.activityId
                    ? <Link to={`/activities/${encodeURIComponent(r.activityId)}`} className="block truncate text-sm font-semibold hover:underline">{r.name}</Link>
                    : <span className="block truncate text-sm font-semibold">{r.name}</span>}
                  <span className="text-xs text-muted-foreground"><span className="sm:hidden">{fmtDay(r.date, { day: "numeric", month: "short", year: "numeric" })} · </span>{distLabel(r.distanceKm)}{r.activityId && <span className="hidden sm:inline">{` · ${t("rr.linked")}`}</span>}</span>
                </span>
                {r.resultSeconds != null ? (
                  <>
                    <span className="text-right text-[15px] font-semibold">{fmtClock(r.resultSeconds)}</span>
                    <span className="col-span-2 text-xs sm:col-span-1 sm:text-right">
                      {c && <span className="block text-muted-foreground">{c.predictedSeconds != null ? t("rr.said", { time: fmtClock(c.predictedSeconds) }) : t("rr.noPrediction")}</span>}
                      {d && <span className={cn("font-semibold", d.better ? "text-success" : "text-muted-foreground")}>{d.text}</span>}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-right"><Button variant="outline" className="h-8 border-dashed border-primary px-2.5 text-sm text-primary" onClick={() => setEntering(r.id)}>{t("rr.enterTime")}</Button></span>
                    <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-right">{sug && t("rr.found", { time: fmtClock(sug.seconds) })}</span>
                  </>
                )}
                <span className="col-span-full flex gap-1 sm:col-start-2">
                  <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => onEdit(r)}>{t("common.edit")}</Button>
                  <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRemove(r)}>{t("common.remove")}</Button>
                </span>
                {entering === r.id && <EnterTime race={r} suggested={sug?.seconds ?? null} onDone={done} onCancel={() => setEntering(null)} />}
              </li>
            );
          })}
        </ul>
      )}
      {adding && <AddPastRace onDone={done} onCancel={() => setAdding(false)} today={today} />}
      {showKey && <AnswerKey races={races} />}
    </Card>
  );
}

function EnterTime({ race, suggested, onDone, onCancel }: { race: Race; suggested: number | null; onDone: () => void; onCancel: () => void }) {
  const [time, setTime] = useState(suggested ? fmtClock(suggested) : "");
  const save = useAction(async () => {
    const resultSeconds = parseGoalTime(time);
    if (resultSeconds == null) throw new Error(t("rr.timeFormat"));
    await api(`/races/${race.id}`, { method: "PUT", body: { name: race.name, date: race.date, distanceKm: race.distanceKm, goalSeconds: race.goalSeconds, priority: race.priority, resultSeconds } });
  }, onDone);
  return (
    <div className="col-span-full flex flex-wrap items-end gap-2 pb-1">
      <Field label={t("rr.time")}><Input autoFocus value={time} onChange={(e) => setTime(e.target.value)} placeholder="1:38:12" className="w-32 text-right tabular-nums" /></Field>
      <BusyButton busy={save.busy} disabled={!time} onClick={() => save.run()}>{t("common.save")}</BusyButton>
      <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      <ErrorText>{save.error}</ErrorText>
    </div>
  );
}

function AddPastRace({ onDone, onCancel, today }: { onDone: () => void; onCancel: () => void; today: string }) {
  const distLabel = useDistLabel();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [km, setKm] = useState<number>(21.0975);
  const [time, setTime] = useState("");
  const save = useAction(async () => {
    const resultSeconds = parseGoalTime(time);
    if (resultSeconds == null) throw new Error(t("rr.timeFormat"));
    await api("/races", { body: { name: name.trim(), date, distanceKm: km, priority: "B", resultSeconds } });
  }, onDone);
  return (
    <div className="space-y-2 rounded-md border border-primary p-3">
      <strong className="text-sm">{t("rr.addPastTitle")}</strong>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_9rem_7.5rem]">
        <Field label={t("rr.name")}><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Stockholm Marathon" /></Field>
        <Field label={t("common.date")}><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("builder.distance")}>
          <Select value={String(km)} onChange={(e) => setKm(Number(e.target.value))}>
            {DISTANCES.map((d) => <option key={d.km} value={d.km}>{distLabel(d.km)}</option>)}
          </Select>
        </Field>
        <Field label={t("rr.time")}><Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="1:38:12" className="text-right tabular-nums" /></Field>
      </div>
      <p className="text-xs text-muted-foreground">{t("rr.addPastHint")}</p>
      <div className="flex gap-2">
        <BusyButton busy={save.busy} disabled={!name.trim() || !date || !time} onClick={() => save.run()}>{t("common.save")}</BusyButton>
        <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
      <ErrorText>{save.error}</ErrorText>
    </div>
  );
}

/* ---------- On the prediction: the answer key ---------- */

export function AnswerKey({ races }: { races: Race[] }) {
  const distLabel = useDistLabel();
  const { data } = useApi<ResultsData>("/races/results");
  const checks = data?.checks ?? [];
  const [open, setOpen] = useState<number | null>(null);
  if (!checks.length) return null;
  const nameOf = (id: number) => races.find((r) => r.id === id)?.name ?? "";
  const sel = checks.find((c) => c.raceId === (open ?? checks[0].raceId)) ?? checks[0];
  return (
    <div className="space-y-2.5 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("rr.key")}</h3>
        <span className="text-xs text-muted-foreground">{t("rr.keyCount", { n: checks.length })}</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem] gap-2 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>{t("rr.race")}</span><span className="text-right">{t("rr.predicted")}</span><span className="text-right">{t("rr.result")}</span><span className="text-right">{t("rr.diff")}</span>
        </div>
        {checks.map((c) => {
          const d = c.predictedSeconds != null ? diffText(c.predictedSeconds, c.resultSeconds) : null;
          const share = c.predictedSeconds != null ? missOf(c.predictedSeconds, c.resultSeconds).share : null;
          return (
            <button key={c.raceId} type="button" onClick={() => setOpen(c.raceId)} aria-pressed={sel.raceId === c.raceId}
              className={cn("grid w-full grid-cols-3 items-center gap-x-2 gap-y-1.5 border-t border-border px-3 py-2.5 text-left tabular-nums hover:bg-accent [&:nth-child(2)]:border-t-0 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem] sm:[&:nth-child(2)]:border-t", sel.raceId === c.raceId && checks.length > 1 && "bg-accent")}>
              <span className="col-span-3 min-w-0 sm:col-span-1"><strong className="block truncate text-sm">{nameOf(c.raceId)}</strong><span className="text-xs text-muted-foreground">{fmtDay(c.date, { day: "numeric", month: "short" })} · {distLabel(c.distanceKm)} · {t("rr.dayBefore")}</span></span>
              <span className="text-sm sm:text-right"><span className="block text-xs text-muted-foreground sm:hidden">{t("rr.predicted")}</span>{c.predictedSeconds != null ? fmtClock(c.predictedSeconds) : "–"}</span>
              <span className="text-sm font-semibold sm:text-right"><span className="block text-xs font-normal text-muted-foreground sm:hidden">{t("rr.result")}</span>{fmtClock(c.resultSeconds)}</span>
              <span className={cn("text-right text-sm font-semibold", d?.better ? "text-success" : "text-muted-foreground")}>
                <span className="block text-xs font-normal text-muted-foreground sm:hidden">{t("rr.diff")}</span>
                {d?.text ?? "–"}{share != null && <span className="block text-xs font-normal text-muted-foreground">{`${share > 0 ? "−" : "+"}${Math.abs(share * 100).toFixed(1)} %`}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {sel.models.length > 0 && (
        <details open className="text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">{t("rr.byModel", { name: nameOf(sel.raceId) })}</summary>
          <div className="mt-2 space-y-1.5 tabular-nums">
            {sel.models.map((m, _i, all) => {
              const miss = m.seconds - sel.resultSeconds;
              // Half a bar for the model that missed the most, so the others read against it.
              const most = Math.max(...all.map((x) => Math.abs(x.seconds - sel.resultSeconds)), 1);
              const w = (Math.abs(miss) / most) * 48;
              return (
                <div key={m.model} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.25rem] items-center gap-2.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4.5rem]">
                  <span className="truncate">{t(`rr.model.${m.model}` as MsgKey)}</span>
                  <span aria-hidden className="relative h-2 rounded-full bg-muted">
                    <span className="absolute -top-[3px] left-1/2 h-3.5 w-0.5 bg-foreground" />
                    <span className="absolute top-0 h-2 rounded-full" style={{ background: "var(--chart-4)", width: `${w}%`, left: miss >= 0 ? "50%" : `${50 - w}%` }} />
                  </span>
                  <span className="text-right">{`${miss >= 0 ? "+" : "−"}${fmtClock(Math.abs(miss))}`}</span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">{t("rr.barHint")}</p>
          </div>
        </details>
      )}
      <p className="text-xs text-muted-foreground">{t("rr.note")}</p>
    </div>
  );
}
