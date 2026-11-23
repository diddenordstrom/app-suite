import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, useAction } from "./http";
import { useSync } from "./garminSync";
import { useFmt } from "./prefs";
import { Badge, BusyButton, Button, Card, CardTitle, ErrorText, InfoTip } from "./ui";
import { fmtDay } from "./bits";
import { stepsSummaryFor } from "./steps";
import { ToWatch, WatchAddOnHint } from "./watch";
import { locale, t } from "./i18n";
import type { HomeData } from "./types";
import { FEELS, type Feel, type KeyFix, type Rebalance, type TooHard } from "@/shared/today";
import { STUDY_URL } from "./suggestweek";
import { plannedKmOf } from "@/shared/compliance";
import { KEY_SIGNALS } from "@/shared/recovery";
import { KEY_TYPES, type Workout } from "@/shared/types";

/*
 * Home's "Idag" card (docs/decisions/fartlek-today.md): today's form with today's session, and a
 * suggestion only when something happened (a run missed earlier in the week, low form on a key
 * session, a key session ahead too big after a missed one). Why the score is what it is sits behind ⓘ, the signals behind "Visa underlag".
 */

const num = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
const list = (xs: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(xs);
const weekdayOf = (d: string) => fmtDay(d, { weekday: "long" });

function useLabel() {
  const fmt = useFmt();
  return (w: Workout) => {
    const km = plannedKmOf(w);
    return [t(`workout.${w.type}`), km ? fmt.dist(km) : null].filter(Boolean).join(" ").toLocaleLowerCase(locale);
  };
}

export function TodayCard({ data, onChanged, signals, checkin }: { data: HomeData; onChanged: () => void; signals: ReactNode; checkin: ReactNode }) {
  const [showSignals, setShowSignals] = useState(false);
  return (
    <Card horizon data-tour="home-form" className="flex flex-col gap-4 md:col-span-2 lg:col-span-3">
      <CardTitle>{t("today.title")}</CardTitle>
      <Score data={data} />
      <Sessions data={data} />
      {data.missed[0] && <Missed key={data.missed[0].workout.id} data={data} onChanged={onChanged} />}
      {data.lowForm && <LowForm data={data} onChanged={onChanged} />}
      {data.keyFixes.map((f) => <KeyFixCard key={`${f.kind}-${f.workout.id}`} fix={f} onChanged={onChanged} />)}
      {data.tooHard && <TooHardCard key={`${data.tooHard.session.id}-${data.tooHard.step}`} p={data.tooHard} onChanged={onChanged} />}
      {data.tooFast.map((w) => <p key={w.id} className="text-xs text-muted-foreground">{t("today.tooFast", { day: weekdayOf(w.date), session: t(`workout.${w.type}`).toLocaleLowerCase(locale) })}</p>)}
      <div className="mt-auto space-y-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {checkin}
          <Button variant="ghost" className="h-9 text-muted-foreground" aria-expanded={showSignals} onClick={() => setShowSignals(!showSignals)}>
            {showSignals ? t("today.hideSignals") : t("today.showSignals")} <span aria-hidden>{showSignals ? "▴" : "▾"}</span>
          </Button>
        </div>
        {showSignals && signals}
      </div>
    </Card>
  );
}

/** The score, the verdict and its advice; what took the score down is behind ⓘ, only when asked. */
export function Score({ data }: { data: HomeData }) {
  const { score, verdict, signals, uncertain, veto } = data.readiness;
  if (score == null) return <p className="text-sm text-muted-foreground">{t("form.noData")}</p>;
  const tone = uncertain ? "text-muted-foreground" : verdict === "fine" ? "text-success" : verdict === "stop" ? "text-danger" : "text-warning";
  const bar = uncertain ? "bg-muted-foreground" : verdict === "fine" ? "bg-success" : verdict === "stop" ? "bg-danger" : "bg-warning";
  const off = signals.filter((s) => s.points > 0).sort((a, b) => b.points - a.points);
  const missing = signals.filter((s) => KEY_SIGNALS.includes(s.key) && s.value == null);
  const painLevel = signals.find((s) => s.key === "pain")?.value ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <span className={`font-display text-6xl leading-none font-medium tracking-tight tabular-nums ${uncertain ? "text-muted-foreground" : ""}`}>{score}{uncertain && "*"}<span className="text-lg font-normal text-muted-foreground">{t("form.outOf")}</span></span>
        <span className={`font-display text-2xl italic ${tone}`}>{t(`form.${verdict}`)}</span>
        <span className="ml-auto self-center">
          <InfoTip label={t("today.why", { score })}>
            <span className="block font-semibold">{t("today.whyTitle", { score })}</span>
            {off.length ? t("form.lowered", { reasons: list(off.map((s) => t(`deduct.${s.key}`, { n: num(s.points) }))) }) : t("today.nothingOff")}
            {uncertain && <span className="mt-1 block">{t("form.uncertain", { signals: list(missing.map((s) => t(`signal.${s.key}`))) })}</span>}
          </InfoTip>
        </span>
      </div>
      <div className="flex gap-1" role="img" aria-label={`${score}${t("form.outOf")}`}>
        {Array.from({ length: 10 }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? bar : "bg-muted"}`} />)}
      </div>
      {veto && <p className="text-sm font-medium">{t("form.veto", { level: painLevel })}</p>}
      <p className={`text-sm ${verdict === "fine" ? "text-muted-foreground" : "font-medium"}`}>{verdict === "fine" ? t("form.allGood") : t(`verdict.${verdict}`)}</p>
    </div>
  );
}

export function Sessions({ data }: { data: HomeData }) {
  const fmt = useFmt();
  if (!data.todaySessions.length) return <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">{t("today.rest")}</p>;
  return (
    <ul className="space-y-2">
      {data.todaySessions.map((s) => {
        const key = KEY_TYPES.includes(s.workout.type);
        const km = plannedKmOf(s.workout);
        const steps = stepsSummaryFor(s.workout.steps, fmt.units);
        const done = s.outcome === "done" || s.outcome === "short";
        return (
          <li key={s.workout.id} className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${key ? "bg-signature-soft text-signature-foreground" : "bg-muted"}`}>
            <span className={`w-1 self-stretch rounded-full ${key ? "bg-signature" : "bg-chart-1"}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-xs">{t(`workout.${s.workout.type}`)}{key && ` · ${t("home.keySession")}`}</span>
              <span className="block font-semibold">{[km ? fmt.dist(km) : null, steps].filter(Boolean).join(" · ") || t(`workout.${s.workout.type}`)}</span>
            </span>
            {s.workout.type === "strength" && !done && <Link to={`/gym?date=${s.workout.date}`} className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">{t("gym.openSession")}</Link>}
            {done ? <Badge>{t("today.done")}</Badge> : data.watch && s.workout.steps && <ToWatch id={s.workout.id} sent={data.watch.sent.includes(s.workout.id)} />}
          </li>
        );
      })}
      {!data.watch && data.todaySessions.some((s) => s.workout.steps && s.workout.status === "planned" && s.outcome !== "done" && s.outcome !== "short") && <li className="px-1"><WatchAddOnHint /></li>}
    </ul>
  );
}

/** A run left behind earlier this week: move it to a day where it fits, or strike it and maybe spread its km. */
function Missed({ data, onChanged }: { data: HomeData; onChanged: () => void }) {
  const m = data.missed[0];
  const label = useLabel();
  const fmt = useFmt();
  const sync = useSync();
  const [plan, setPlan] = useState<Rebalance | null>(null);
  const km = plannedKmOf(m.workout);
  const move = useAction(() => api(`/workouts/${m.workout.id}`, { method: "PATCH", body: { date: m.moveTo } }), onChanged);
  // Take over an easy run's day: the easy run moves to a free day, or is struck when there is none.
  const swap = useAction(async () => {
    const sw = m.swap!;
    await api(`/workouts/${sw.other.id}`, { method: "PATCH", body: sw.otherTo ? { date: sw.otherTo } : { status: "dropped" } });
    await api(`/workouts/${m.workout.id}`, { method: "PATCH", body: { date: sw.date } });
  }, onChanged);
  const strike = useAction(async () => {
    await api(`/workouts/${m.workout.id}`, { method: "PATCH", body: { status: "dropped" } });
    setPlan(await api<Rebalance>(`/home/rebalance?km=${km}`));
  });
  const apply = useAction(async () => {
    for (const c of plan!.changes) await api(`/workouts/${c.workoutId}`, { method: "PATCH", body: { distanceKm: c.toKm } });
  }, onChanged);

  if (plan) {
    return (
      <Suggestion title={plan.changes.length ? t("today.rebalanceTitle") : undefined}>
        {plan.changes.length ? (
          <>
            <p className="text-xs text-muted-foreground">{t("today.rebalanceBody", { km: fmt.dist(km) })}</p>
            <ul className="space-y-1 text-sm tabular-nums">
              {plan.changes.map((c) => (
                <li key={c.workoutId} className="flex items-center gap-2">
                  <span className="w-12 capitalize">{fmtDay(c.date, { weekday: "short" })}</span>
                  <span className="flex-1">{t(`workout.${c.type}`)}</span>
                  <span className="text-xs text-muted-foreground">{fmt.num(c.fromKm)} →</span>
                  <span className="font-semibold">{fmt.dist(c.toKm)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("today.weekKm", { km: fmt.dist(plan.weekKm) })}{plan.leftoverKm > 0 && <> · {t("today.rebalanceLeft", { km: fmt.dist(plan.leftoverKm) })}</>}
            </p>
            <div className="flex flex-wrap gap-2">
              <BusyButton busy={apply.busy} onClick={() => apply.run()}>{t("today.apply")}</BusyButton>
              <Button variant="outline" onClick={onChanged}>{t("today.keep")}</Button>
            </div>
            <ErrorText>{apply.error}</ErrorText>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{t("today.rebalanceNone", { km: fmt.dist(km) })}</span>
            <Button variant="outline" className="h-9" onClick={onChanged}>{t("today.ok")}</Button>
          </div>
        )}
      </Suggestion>
    );
  }

  const day = weekdayOf(m.workout.date);
  return (
    <Suggestion title={t("today.missedTitle", { day: day.charAt(0).toLocaleUpperCase(locale) + day.slice(1), session: label(m.workout) })}>
      <p className="text-xs text-muted-foreground">{t("today.missedBody")}</p>
      <div className="flex flex-wrap gap-2">
        {m.moveTo && <BusyButton variant="outline" busy={move.busy} onClick={() => move.run()}>{t("today.moveTo", { day: weekdayOf(m.moveTo) })}</BusyButton>}
        {m.swap && <BusyButton variant="outline" busy={swap.busy} onClick={() => swap.run()}>{t("today.takeOver", { day: weekdayOf(m.swap.date), other: label(m.swap.other) })}</BusyButton>}
        <BusyButton variant="outline" busy={strike.busy} onClick={() => strike.run()}>{t("today.strike")}</BusyButton>
        {data.garmin.connected && <BusyButton variant="ghost" className="text-muted-foreground" busy={sync.busy} onClick={() => sync.run()}>{t("today.syncIt")}</BusyButton>}
      </div>
      {m.swap && <p className="text-xs text-muted-foreground">{m.swap.otherTo ? t("today.takeOverMoves", { other: label(m.swap.other), day: weekdayOf(m.swap.otherTo) }) : t("today.takeOverStrikes", { other: label(m.swap.other) })}</p>}
      {!m.moveTo && !m.swap && <p className="text-xs text-muted-foreground">{t("today.noDay")}</p>}
      <ErrorText>{move.error ?? swap.error ?? strike.error ?? sync.error}</ErrorText>
    </Suggestion>
  );
}

/** Low form on today's key session: ask how the body feels; only "fresh" sets the suggestion aside. */
function LowForm({ data, onChanged }: { data: HomeData; onChanged: () => void }) {
  const p = data.lowForm!;
  const label = useLabel();
  const feel = useAction((f: Feel) => api(`/checkins/${data.today}/feel`, { method: "PUT", body: { feel: f } }), onChanged);
  const apply = useAction(async () => {
    if (p.kind === "swap") {
      await api(`/workouts/${p.workout.id}`, { method: "PATCH", body: { date: p.other.date } });
      await api(`/workouts/${p.other.id}`, { method: "PATCH", body: { date: data.today } });
    } else await api(`/workouts/${p.workout.id}`, { method: "PATCH", body: { date: p.date } });
  }, onChanged);
  const [kept, setKept] = useState(false);

  return (
    <Suggestion title={t("today.feelTitle", { session: label(p.workout) })}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("today.feelTitle", { session: label(p.workout) })}>
        {FEELS.map((f) => (
          <button key={f} aria-pressed={data.feel === f} disabled={feel.busy} onClick={() => feel.run(f)}
            className={`h-11 rounded-full border px-4 text-sm font-medium ${data.feel === f ? "border-signature bg-signature-soft text-signature-foreground" : "border-border bg-card hover:bg-accent"}`}>
            {t(`today.feel.${f}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("today.feelHint")}</p>
      <ErrorText>{feel.error}</ErrorText>
      {data.feel === "fresh" ? <p className="text-sm">{t("today.freshNote")}</p> : data.feel && !kept && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-semibold">
            {p.kind === "swap"
              ? t("today.swap", { session: label(p.workout), day: weekdayOf(p.other.date), other: label(p.other) })
              : t("today.move", { session: label(p.workout), day: weekdayOf(p.date) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <BusyButton busy={apply.busy} onClick={() => apply.run()}>{t("today.apply")}</BusyButton>
            <Button variant="outline" onClick={() => setKept(true)}>{t("today.keepPlan")}</Button>
          </div>
          <ErrorText>{apply.error}</ErrorText>
        </div>
      )}
    </Suggestion>
  );
}

/** "Behåll planen" on a key-session fix is remembered per session and size, in this browser. */
const fixKey = (f: KeyFix) => `fartlek.keyfix.${f.workout.id}.${f.kind === "long" ? f.fromKm : `${f.from.reps}x${f.from.min}`}`;
const wasKept = (f: KeyFix) => { try { return localStorage.getItem(fixKey(f)) === "1"; } catch { return false; } };

/**
 * A long run or threshold session ahead that a missed one made too big: back to the long run's step
 * (the longest run of 30 days + 1 km) or to the rung after the last threshold session run.
 */
function KeyFixCard({ fix, onChanged }: { fix: KeyFix; onChanged: () => void }) {
  const fmt = useFmt();
  const [kept, setKept] = useState(() => wasKept(fix));
  const apply = useAction(() => api(`/workouts/${fix.workout.id}`, { method: "PATCH",
    body: fix.kind === "long" ? { distanceKm: fix.toKm } : { stepsText: fix.stepsText } }), onChanged);
  if (kept) return null;
  const keep = () => { try { localStorage.setItem(fixKey(fix), "1"); } catch { /* the card just comes back */ } setKept(true); };
  const day = weekdayOf(fix.workout.date);
  const reps = (r: { reps: number; min: number }) => `${r.reps}x${r.min} min`;
  const to = fix.kind === "long" ? fmt.dist(fix.toKm) : reps(fix.to);
  return (
    <Suggestion title={fix.kind === "long"
      ? t("today.longFixTitle", { day, from: fmt.dist(fix.fromKm), to })
      : t("today.thrFixTitle", { day, from: reps(fix.from), to })}>
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        <span>{fix.kind === "long"
          ? t("today.longFixBody", { longest: fmt.dist(fix.longestKm) })
          : fix.lastRun ? t("today.thrFixBody", { last: reps(fix.lastRun), to }) : t("today.thrFixBodyNone", { to })}</span>
        {fix.kind === "long" && (
          <InfoTip label={t("today.longFixWhy")}>
            <span className="block">{t("today.longFixInfo")}</span>
            <a className="mt-1 inline-block font-medium text-primary underline" href={STUDY_URL} target="_blank" rel="noreferrer">{t("next.why.study")}</a>
          </InfoTip>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <BusyButton busy={apply.busy} onClick={() => apply.run()}>{t("today.fixApply", { to })}</BusyButton>
        <Button variant="outline" onClick={keep}>{t("today.keepPlan")}</Button>
      </div>
      <ErrorText>{apply.error}</ErrorText>
    </Suggestion>
  );
}

function Suggestion({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-md border border-dashed border-signature p-3">
      {title && <p className="text-sm font-semibold">{title}</p>}
      {children}
    </div>
  );
}

/** "Behåll planen" on a too-hard suggestion is remembered per session and step, in this browser. */
const hardKey = (p: TooHard) => `fartlek.toohard.${p.session.id}.${p.step}`;

/**
 * A session much harder than planned: the first step of the dial that applies (next day easy, a threshold session a rung
 * down, the week's easy runs shorter, the long run last). The long run keeps its step as long as anything else helps.
 */
function TooHardCard({ p, onChanged }: { p: TooHard; onChanged: () => void }) {
  const fmt = useFmt();
  const label = useLabel();
  const [kept, setKept] = useState(() => { try { return localStorage.getItem(hardKey(p)) === "1"; } catch { return false; } });
  const apply = useAction(async () => {
    for (const c of p.changes) {
      const body: Record<string, unknown> = {};
      if (c.moveTo) body.date = c.moveTo;
      if (c.toType) body.type = c.toType;
      if (c.stepsText !== undefined) body.stepsText = c.stepsText;
      if (c.toKm !== c.fromKm) body.distanceKm = c.toKm;
      await api(`/workouts/${c.workoutId}`, { method: "PATCH", body });
    }
  }, onChanged);
  if (kept) return null;
  const keep = () => { try { localStorage.setItem(hardKey(p), "1"); } catch { /* the card just comes back */ } setKept(true); };
  const what = (c: TooHard["changes"][number]) => {
    const day = weekdayOf(c.date);
    if (c.moveTo) return t("today.hard.move", { day, to: weekdayOf(c.moveTo) });
    if (c.toType === "easy") return t("today.hard.easy", { day });
    if (p.step === "rungDown") return t("today.hard.rung", { day, steps: (c.stepsText ?? "").match(/\d+x\d+/)?.[0] ?? "" });
    return t("today.hard.trim", { day, type: t(`workout.${c.type}`).toLocaleLowerCase(locale), from: fmt.dist(c.fromKm), to: fmt.dist(c.toKm) });
  };
  return (
    <Suggestion title={t("today.hard.title", { session: label(p.session), day: weekdayOf(p.session.date) })}>
      <p className="text-xs text-muted-foreground">{t("today.hard.body", { actual: Math.round(p.actual), planned: Math.round(p.planned) })}</p>
      <ul className="space-y-1 text-sm">{p.changes.map((c) => <li key={c.workoutId}>{what(c)}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <BusyButton busy={apply.busy} onClick={() => apply.run()}>{t("today.apply")}</BusyButton>
        <Button variant="outline" onClick={keep}>{t("today.keepPlan")}</Button>
      </div>
      <ErrorText>{apply.error}</ErrorText>
    </Suggestion>
  );
}
