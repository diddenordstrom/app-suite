import { useState } from "react";
import { api } from "./http";
import { t } from "./i18n";
import { useFmt } from "./prefs";
import { Button, ErrorText } from "./ui";
import type { PaceView, RacePaceView } from "@/shared/racephase";

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
