import { useState } from "react";
import { api } from "./http";
import { t } from "./i18n";
import { useFmt } from "./prefs";
import { Button, ErrorText } from "./ui";
import { weekNumber } from "@/shared/dates";
import type { PaceView, PhaseWarnings, RacePaceView } from "@/shared/racephase";
import type { InjuryStop } from "@/shared/recovery";

/*
 * The paces of the race phase (docs/decisions/fartlek-race-specific-phase.md): a card that asks which pace to train
 * for when goal and prediction are far apart or a B race has been run, and a note that always says where the pace
 * came from. The answer is saved on the race; `onAnswered` makes the dialog load again.
 */

const sourceText = (p: PaceView) => (p.source === "none" ? "" : t(`racepace.source.${p.source}`));

/** The pace in use and where it came from, with a warning when a goal faster than 94 % of CS is the source. */
export function RacePaceNote({ view }: { view: RacePaceView }) {
  const fmt = useFmt();
  const p = view.paces;
  const pace = view.kind === "marathon" ? p.mp : p.hmp;
  return (
    <div className="mb-3 space-y-1 text-sm text-muted-foreground">
      <p>{pace == null ? t("racepace.noPace") : t("racepace.note", { pace: fmt.pace(pace), source: sourceText(p) })}</p>
      {p.overCap && <p className="text-amber-600 dark:text-amber-400">{t("racepace.overCap")}</p>}
      {view.injury && <p className="text-amber-600 dark:text-amber-400">{injuryText(view.injury)}</p>}
    </div>
  );
}

/** The question: train for the prediction or the goal, or (after a B race) keep the paces locked. */
export function RacePaceCard({ view, onAnswered }: { view: RacePaceView; onAnswered: () => void }) {
  const fmt = useFmt();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const q = view.question!;
  const of = (p: PaceView | null) => (p ? fmt.pace(view.kind === "marathon" ? p.mp : p.hmp) : "");
  const answer = async (choice: "prediction" | "goal" | "keep") => {
    setBusy(choice); setErr(null);
    try { await api(`/races/${view.raceId}/race-pace`, { body: { choice } }); onAnswered(); } catch (e) { setErr((e as Error).message); setBusy(null); }
  };
  return (
    <div className="space-y-3 py-2">
      <h3 className="text-lg font-semibold">{t("racepace.title")}</h3>
      <p className="text-sm text-muted-foreground">
        {q.kind === "choose" ? t("racepace.choose", { goal: of(q.goal), pred: of(q.prediction) }) : t("racepace.recalc")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => void answer("prediction")}>{t("racepace.usePrediction", { pace: of(q.prediction) })}</Button>
        {q.goal && <Button variant="outline" disabled={!!busy} onClick={() => void answer("goal")}>{t("racepace.useGoal", { pace: of(q.goal) })}</Button>}
        {q.kind === "recalc" && q.current && <Button variant="outline" disabled={!!busy} onClick={() => void answer("keep")}>{t("racepace.keep", { pace: of(q.current) })}</Button>}
      </div>
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

/** What the phase warns about (never a refusal): a thin build week, a long run that never gets long. */
export function PhaseWarningsNote({ warnings }: { warnings: PhaseWarnings | null }) {
  const fmt = useFmt();
  if (!warnings || (!warnings.lowWeek && !warnings.shortLong)) return null;
  return (
    <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      {warnings.lowWeek && <p>{t("racepace.warn.lowWeek", { week: weekNumber(warnings.lowWeek.weekStart), dist: fmt.dist(warnings.lowWeek.km, 0) })}</p>}
      {warnings.shortLong && <p>{t("racepace.warn.shortLong", { dist: fmt.dist(warnings.shortLong.km, 0) })}</p>}
    </div>
  );
}

const injuryText = (i: InjuryStop) => (i.reason === "severe" ? t("racepace.injury.severe", { level: i.level }) : t("racepace.injury.repeated", { days: i.dates.length }));

/** Real injury while the race phase is on: the progression is held, and a lighter re-plan is on offer (the runner chooses). */
export function InjuryOffer({ injury, onReplan }: { injury: InjuryStop; onReplan: (() => void) | null }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
      <div className="min-w-0 flex-1 basis-80 space-y-0.5">
        <p className="text-sm">{injuryText(injury)}</p>
        <p className="text-xs text-muted-foreground">{t("racepace.injury.choice")}</p>
      </div>
      {onReplan && <Button variant="outline" onClick={onReplan}>{t("racepace.injury.replan")}</Button>}
    </div>
  );
}
