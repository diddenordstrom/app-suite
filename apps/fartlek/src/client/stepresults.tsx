import { useState } from "react";
import { Link } from "react-router-dom";
import { fmtDuration } from "../shared/format";
import { amountText, targetText, type StepRole } from "../shared/steps";
import type { StepMatch, StepMatchResult, StepResult, StepStatus } from "../shared/stepmatch";
import type { StreamSuggestion } from "../shared/streamsteps";
import type { Workout } from "../shared/types";
import { api, useAction } from "./http";
import { lang, t } from "./i18n";
import { useFmt } from "./prefs";
import { workoutText } from "./bits";
import { BusyButton, Button, Card, CardTitle, ErrorText, Input } from "./ui";

/*
 * "Planned vs actual" on the activity page (docs/decisions/fartlek-structured-workouts.md): each step
 * of the workout with what was run, judged on its target, and a way to split a lap where a lap press
 * was forgotten. The matching itself is shared/stepmatch.ts, run on the server.
 */

const stepLang = lang === "sv" ? "sv" : "en";
/** HR drift smaller than this is noise between reps, not worth a sentence. */
const DRIFT_SHOWN = 3;

const STATUS_STYLE: Record<StepStatus, string> = {
  in: "bg-success/15 text-success",
  near: "bg-warning/15 text-warning",
  off: "bg-danger/15 text-danger",
  missing: "bg-muted text-muted-foreground",
  unjudged: "",
};

/** "Drag 2", "Uppvärmning": the step's name as the runner reads it. */
export function stepName(r: StepResult): string {
  const base = t(`steps.role.${r.flat.role}` as never);
  return r.flat.role === "work" && r.flat.of && r.flat.of > 1 ? `${base} ${r.flat.rep}` : base;
}

const planText = (r: StepResult, units: "metric" | "imperial") => {
  const target = r.flat.def.target ? ` ${targetText(r.flat.def.target, stepLang, units).replace(/^@/, "")}` : "";
  return `${amountText(r.flat.def, units)}${target}`;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The worst rep (or step) outside its target, as one sentence. */
function worst(m: StepMatch): string | null {
  const out = m.steps.filter((r) => (r.status === "near" || r.status === "off") && r.delta)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))[0];
  if (!out) return null;
  const n = Math.abs(out.delta!);
  const key = out.judge === "pace" ? (out.delta! > 0 ? "pva.slow" : "pva.fast") : (out.delta! > 0 ? "pva.high" : "pva.low");
  return t(key, { step: stepName(out), n });
}

function why(r: StepResult): string | null {
  if (!r.delta) return null;
  const n = Math.abs(r.delta);
  return r.judge === "pace" ? t(r.delta > 0 ? "pva.why.slow" : "pva.why.fast", { n }) : t(r.delta > 0 ? "pva.why.high" : "pva.why.low", { n });
}

function StatusBadge({ r }: { r: StepResult }) {
  if (r.merged) return <span className="inline-block whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">{t("pva.status.merged", { lap: r.merged.lap })}</span>;
  if (r.status === "unjudged") return null;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{t(`pva.status.${r.status}`)}</span>;
}

/** Work steps as time bands with their pace target, for the curves. */
export function stepBands(match: StepMatchResult | null | undefined) {
  if (!match?.ok) return [];
  return match.steps.filter((r) => r.flat.role === "work" && r.startS != null && r.endS != null)
    .map((r) => ({ from: r.startS!, to: r.endS!, pace: r.judge === "pace" ? r.target.pace : null }));
}

export function PlannedCard({ activityId, planned, lapStarts, onChange }: {
  activityId: string;
  planned: { workout: Workout; match: StepMatchResult | null; suggestion: StreamSuggestion | null };
  lapStarts: (number | null)[];
  onChange: () => void;
}) {
  const fmt = useFmt();
  const m = planned.match;
  const base = `/activities/${encodeURIComponent(activityId)}/splits`;
  const undo = useAction(() => api(base, { method: "DELETE" }), onChange);
  if (!m) return null;

  const range = (r: StepResult, kind: "pace" | "hr") => {
    const x = kind === "pace" ? r.target.pace : r.target.hr;
    if (!x) return null;
    return t("pva.target", { range: kind === "pace" ? `${fmt.pace(x[0]).split("/")[0]}–${fmt.pace(x[1]).split("/")[0]}` : r.target.hrCeiling ? `≤ ${x[1]}` : `${x[0]}–${x[1]}` });
  };
  const lapsText = (r: StepResult) => (r.laps.length > 1 ? t("pva.laps", { from: r.laps[0], to: r.laps.at(-1)! }) : r.laps.length ? t("pva.lap", { n: r.laps[0] }) : "");
  const done = (r: StepResult) => (r.durationS == null ? "–" : `${fmtDuration(r.durationS)} · ${fmt.dist((r.distanceM ?? 0) / 1000, 2)}`);
  const muted = (role: StepRole) => role === "recovery";

  return (
    <Card className="space-y-3" data-tour="activity-steps">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">{t("pva.title")}</CardTitle>
        <span className="text-xs text-muted-foreground">
          {t("pva.countsFor")} <Link to="/plan" className="text-primary hover:underline">{workoutText(planned.workout, (km) => fmt.dist(km))}</Link>
          {m.ok && <> · {t("pva.lapsToSteps", { laps: m.lapCount, steps: m.steps.length })}{m.autoMerged > 0 && ` · ${t("pva.autoMerged")}`}{m.extraLaps > 0 && ` · ${t("pva.extraLaps", { n: m.extraLaps })}`}</>}
        </span>
      </div>

      {planned.suggestion && <StreamBox suggestion={planned.suggestion} auto={!m.ok} url={base} onDone={onChange} />}

      {!m.ok ? (
        !planned.suggestion && <p className="text-sm text-muted-foreground">{t(m.reason === "noLaps" ? "pva.noLaps" : "pva.noManualLaps")}</p>
      ) : (
        <>
          {planned.suggestion && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pva.byLaps")}</p>}
          {m.workTotal > 0 && !planned.suggestion && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span data-tour="activity-steps-summary" className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${m.workIn === m.workTotal ? STATUS_STYLE.in : STATUS_STYLE.near}`}>
                {t("pva.summary", { in: m.workIn, total: m.workTotal })}
              </span>
              <span>
                {worst(m)}{" "}
                {m.hrDrift != null && Math.abs(m.hrDrift) >= DRIFT_SHOWN && t(m.hrDrift > 0 ? "pva.drift" : "pva.driftDown", { n: Math.abs(m.hrDrift) })}
              </span>
            </div>
          )}

          {!planned.suggestion && m.steps.filter((r) => r.merged).map((r) => (
            <SplitBox key={r.flat.item * 100 + (r.flat.rep ?? 0)} result={r} next={m.steps[m.steps.indexOf(r) + 1]} lapStart={lapStarts[r.merged!.lap - 1] ?? r.startS} url={base} onDone={onChange} />
          ))}

          {/* Phones: one row per step. */}
          <ul className="divide-y divide-border sm:hidden">
            {m.steps.map((r, k) => (
              <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2">
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${muted(r.flat.role) ? "text-muted-foreground" : ""}`}>
                    {stepName(r)} <span className="font-normal text-muted-foreground">· {planText(r, fmt.units)}</span>
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {r.durationS == null ? t("pva.status.missing") : [
                      fmtDuration(r.durationS),
                      r.pace != null ? fmt.pace(r.pace) : null,
                      r.hr != null ? `${t("stat.hr").toLowerCase()} ${r.hr}` : null,
                    ].filter(Boolean).join(" · ")}
                    {why(r) && ` · ${why(r)}`}
                  </div>
                </div>
                <StatusBadge r={r} />
              </li>
            ))}
          </ul>

          {/* Wider screens: a table. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">{t("pva.step")}</th>
                  <th className="pr-3 font-medium">{t("pva.done")}</th>
                  <th className="pr-3 font-medium">{t("stat.pace")}</th>
                  <th className="pr-3 font-medium">{t("stat.hr")}</th>
                  <th className="pr-3 font-medium">{t("stat.cadence")}</th>
                  <th className="font-medium">{t("pva.result")}</th>
                </tr>
              </thead>
              <tbody>
                {m.steps.map((r, k) => (
                  <tr key={k} className={`border-b border-border align-top ${muted(r.flat.role) ? "text-muted-foreground" : ""}`}>
                    <td className="py-2 pr-3">
                      <div className={muted(r.flat.role) ? "" : "font-medium"}>{stepName(r)}</div>
                      <div className="text-xs text-muted-foreground">{planText(r, fmt.units)}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{done(r)}</div>
                      <div className="text-xs text-muted-foreground">{lapsText(r)}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className={r.judge === "pace" && !muted(r.flat.role) ? "font-semibold" : ""}>{r.pace != null ? fmt.pace(r.pace) : "–"}</div>
                      {r.judge === "pace" && !muted(r.flat.role) && <div className="text-xs text-muted-foreground">{range(r, "pace")}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className={r.judge === "hr" && !muted(r.flat.role) ? "font-semibold" : ""}>{r.hr ?? "–"}</div>
                      {r.judge === "hr" && !muted(r.flat.role) && <div className="text-xs text-muted-foreground">{range(r, "hr")}</div>}
                    </td>
                    <td className="py-2 pr-3">{r.cadence ?? "–"}</td>
                    <td className="py-2">
                      <StatusBadge r={r} />
                      {why(r) && <div className="text-xs text-muted-foreground">{why(r)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">{t("pva.legend")}</p>
          <p className="text-xs text-muted-foreground sm:hidden">{t("pva.legendShort")}</p>
          {m.splits.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <BusyButton variant="ghost" className="h-8 text-xs" busy={undo.busy} onClick={() => undo.run()}>{t("pva.undoSplits", { n: m.splits.length })}</BusyButton>
              <ErrorText>{undo.error}</ErrorText>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** The step changes found in the stream, offered as a whole with the reps they would give. */
function StreamBox({ suggestion, auto, url, onDone }: { suggestion: StreamSuggestion; auto: boolean; url: string; onDone: () => void }) {
  const fmt = useFmt();
  const use = useAction(() => api(url, { body: { all: suggestion.splits } }), onDone);
  const reps = suggestion.preview.steps.filter((r) => r.flat.role === "work");
  return (
    <div role="status" data-tour="activity-stream-steps" className="space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
      <p>
        <span className="text-muted-foreground">{t(auto ? "pva.stream.whyAuto" : "pva.stream.whyLaps")}</span>{" "}
        <span className="font-medium">{reps.length === 1 ? t("pva.stream.foundOne") : t("pva.stream.found", { n: reps.length })}</span>
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
        {reps.map((r, k) => (
          <li key={k}>
            <span className="font-medium text-foreground">{stepName(r)}</span>{" "}
            {[r.durationS != null ? fmtDuration(r.durationS) : null, r.pace != null ? fmt.pace(r.pace) : null].filter(Boolean).join(" · ")}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <BusyButton busy={use.busy} onClick={() => use.run()}>{t("pva.stream.use")}</BusyButton>
        <span className="text-xs text-muted-foreground">{t("pva.stream.hint")}</span>
      </div>
      <ErrorText>{use.error}</ErrorText>
    </div>
  );
}

/** Split a too-long lap, defaulting to where the plan says the step ends. */
function SplitBox({ result, next, lapStart, url, onDone }: { result: StepResult; next: StepResult | undefined; lapStart: number | null; url: string; onDone: () => void }) {
  const merged = result.merged!;
  const start = lapStart ?? merged.at;
  // The default is where the pace changes near the plan's point (found on the server), else the plan's point.
  const def = mmss(Math.max(0, merged.at - start));
  const [text, setText] = useState(def);
  const [bad, setBad] = useState(false);
  const split = useAction((atS: number) => api(url, { body: { atS } }), onDone);
  const go = () => {
    const mm = text.trim().match(/^(\d{1,3}):([0-5]\d)$/);
    if (!mm) { setBad(true); return; }
    setBad(false);
    void split.run(start + Number(mm[1]) * 60 + Number(mm[2]));
  };
  return (
    <div role="status" data-tour="activity-split" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
      <p>{t("pva.merged", { lap: merged.lap, step: stepName(result), next: next ? stepName(next).toLowerCase() : "" })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`split-${merged.lap}`}>{t("pva.splitAt")}</label>
        <Input id={`split-${merged.lap}`} value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" className="w-20 tabular-nums" aria-invalid={bad} />
        <Button onClick={go} disabled={split.busy}>{t("pva.splitButton", { lap: merged.lap })}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("pva.splitHint", { default: def })}</p>
      <ErrorText>{bad ? t("pva.splitBad") : split.error}</ErrorText>
    </div>
  );
}
