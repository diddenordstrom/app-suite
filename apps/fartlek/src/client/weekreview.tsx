import { useState } from "react";
import { api, useAction } from "./http";
import { useFmt } from "./prefs";
import { BusyButton, Button, Card, ErrorText } from "./ui";
import { fmtDay } from "./bits";
import { SuggestWeekDialog } from "./suggestweek";
import { ReplanDialog } from "./suggestblock";
import { t } from "./i18n";
import type { HomeData } from "./types";
import { CATCHUP_TAG } from "@/shared/blocks";
import { addDays, daysBetween, weekNumber } from "@/shared/dates";
import { primaryReason, REASONS, recommend, type Reason } from "@/shared/weekreview";

/*
 * Home's Monday check-in (docs/decisions/fartlek-adaptive-engine.md): a card above "Idag" in the first days of
 * a week. A quiet week shows nothing. One missed run that can be caught up on the long run is a small proposal
 * with a "Varför?" that unfolds the reasoning. Two missed runs in a row, up to a whole week, ask why first, and
 * the recommendation unfolds as reasons are picked. Nothing changes until the runner accepts; "Ignorera" is
 * remembered in the browser and leaves a one-line row to change one's mind.
 */

const stateKey = (weekStart: string) => `fartlek.weekreview.${weekStart}`;
const readState = (weekStart: string): "ignored" | "done" | null => {
  try { const v = localStorage.getItem(stateKey(weekStart)); return v === "ignored" || v === "done" ? v : null; } catch { return null; }
};
const writeState = (weekStart: string, v: "ignored" | "done" | null) => {
  try { if (v) localStorage.setItem(stateKey(weekStart), v); else localStorage.removeItem(stateKey(weekStart)); } catch { /* the card just comes back */ }
};

/** A section that unfolds with a short height transition (none for reduced motion). */
function Unfold({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function WeekReviewCard({ data, onChanged }: { data: HomeData; onChanged: () => void }) {
  // Offered through the first days of the week only.
  const review = daysBetween(data.week.weekStart, data.today) <= 3 ? data.review : null;
  const [state, setState] = useState(() => (review ? readState(review.weekStart) : null));
  if (!review || state === "done") return null;
  const set = (v: "ignored" | "done" | null) => { writeState(review.weekStart, v); setState(v); };
  if (state === "ignored") {
    if (review.kind === "quiet" || (review.kind === "small" && !review.catchUp)) return null;
    return (
      <Card className="flex items-center justify-between gap-3 py-3 text-sm">
        <span className="flex items-center gap-3"><span className="size-2 shrink-0 rounded-full bg-signature" aria-hidden />{t("wr.unadjusted")}</span>
        <Button variant="outline" className="h-8" onClick={() => set(null)}>{t("wr.adjust")}</Button>
      </Card>
    );
  }
  if (review.kind === "quiet" || (review.kind === "small" && !review.catchUp)) return null;
  return review.kind === "ask"
    ? <AskCard data={data} review={review} onIgnore={() => set("ignored")} onDone={() => { set("done"); onChanged(); }} />
    : <SmallCard review={review} onIgnore={() => set("ignored")} onDone={() => { set("done"); onChanged(); }} />;
}

type Review = NonNullable<HomeData["review"]>;

function Header({ ask }: { ask: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-3 ${ask ? "bg-signature-soft text-signature-foreground" : ""}`}>
      <span className="size-2 rounded-full bg-signature" aria-hidden />
      <h2 className="text-sm font-semibold">{t("wr.title")}</h2>
    </div>
  );
}

function Stats({ review }: { review: Review }) {
  const fmt = useFmt();
  const num = (n: number) => fmt.num(n);
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
      <span className="text-sm"><b className="text-2xl font-semibold">{review.doneRuns}</b> <span className="text-xs text-muted-foreground">{t("wr.stat.runs", { planned: review.plannedRuns })}</span></span>
      <span className="text-sm"><b className="text-2xl font-semibold">{num(review.doneKm)}</b> <span className="text-xs text-muted-foreground">{t("wr.stat.km", { planned: num(review.plannedKm), unit: fmt.unit })}</span></span>
    </div>
  );
}

/** One missed run, a long run that may be lifted a little: the reasoning is behind "Varför?". */
function SmallCard({ review, onIgnore, onDone }: { review: Review; onIgnore: () => void; onDone: () => void }) {
  const fmt = useFmt();
  const [why, setWhy] = useState(false);
  const c = review.catchUp!;
  const miss = review.missed[0];
  const accept = useAction(() => api(`/workouts/${c.workoutId}`, { method: "PATCH", body: { distanceKm: c.toKm, notes: CATCHUP_TAG } }), onDone);
  const day = fmtDay(miss.date, { weekday: "long" });
  const step = fmt.dist(Math.floor(c.longestKm * 1.1 * 2) / 2);
  return (
    <Card className="p-0">
      <Header ask={false} />
      <div className="space-y-3 px-4 pb-4">
        <Stats review={review} />
        <p className="text-sm">{t("wr.smallBody", { day, dist: fmt.dist(c.missedKm) })}</p>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("wr.proposal")}</h3>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent px-3 py-2.5 text-accent-foreground">
            <span className="text-sm font-medium">{t("wr.longRun", { day: fmtDay(c.date, { weekday: "long" }) })}</span>
            <span className="flex items-center gap-2.5 text-sm font-semibold tabular-nums">
              {fmt.dist(c.fromKm)} → {fmt.dist(c.toKm)}
              <button type="button" aria-expanded={why} aria-controls="wr-why" onClick={() => setWhy(!why)}
                className="h-6 rounded-full border border-primary px-2 text-xs font-semibold">{why ? t("wr.hide") : t("wr.why")}</button>
            </span>
          </div>
          <div id="wr-why"><Unfold open={why}>
            <div className="space-y-2 rounded-md border border-border bg-muted p-3 text-xs">
              <p className="text-sm font-semibold">{t("wr.whyTitle")}</p>
              <p>{t("wr.whyRested", { day, dist: fmt.dist(c.missedKm) })}</p>
              <p>{t("wr.whyRule", { longest: fmt.dist(c.longestKm), step })}</p>
              <p>{t("wr.whyExtra", { to: fmt.dist(c.toKm) })}</p>
              <Button variant="outline" className="h-8" onClick={onIgnore}>{t("wr.keep", { to: fmt.dist(c.fromKm) })}</Button>
            </div>
          </Unfold></div>
        </div>
        <div className="flex gap-2">
          <BusyButton className="flex-1" busy={accept.busy} onClick={() => accept.run()}>{t("wr.accept")}</BusyButton>
          <Button variant="outline" className="flex-1" onClick={onIgnore}>{t("wr.ignore")}</Button>
        </div>
        <ErrorText>{accept.error}</ErrorText>
      </div>
    </Card>
  );
}

/** A stretch missed: ask why; the recommendation unfolds once a reason is picked and follows the reasons. */
function AskCard({ data, review, onIgnore, onDone }: { data: HomeData; review: Review; onIgnore: () => void; onDone: () => void }) {
  const [sel, setSel] = useState<Reason[]>([]);
  const [planning, setPlanning] = useState(false);
  const block = data.block;
  const rec = recommend(sel);
  const primary = primaryReason(sel);
  const toggle = (r: Reason) => setSel(sel.includes(r) ? sel.filter((x) => x !== r) : [...sel, r]);
  const note = sel.includes("injury") ? t("wr.note.injury") : sel.includes("sick") && (sel.includes("stress") || sel.includes("tired")) ? t("wr.note.mixed") : null;
  // Reasons go on the missed sessions; then the one engine is asked for the rest of the block from today with the answer as
  // input (a week more, lighter or not), and shows what changes before anything is saved. Outside a block: just the week.
  const accept = useAction(async () => {
    if (primary) {
      for (const w of review.missed) if (!w.skipReason) await api(`/workouts/${w.id}`, { method: "PATCH", body: { status: "skipped", skipReason: primary } });
    }
    setPlanning(true);
  });
  const endWeek = block ? weekNumber(addDays(block.startWeek, block.weeks * 7 - 1)) : 0;
  return (
    <Card className="overflow-hidden p-0">
      <Header ask />
      <div className="space-y-3.5 px-4 pb-4 pt-3.5">
        <Stats review={review} />
        <p className="text-sm">{t("wr.askBody", { missed: review.missed.length, planned: review.plannedRuns })}</p>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{t("wr.question")}</h3>
          <p className="text-xs text-muted-foreground">{t("wr.questionHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => {
            const on = sel.includes(r);
            return (
              <button key={r} type="button" aria-pressed={on} onClick={() => toggle(r)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-border bg-card font-medium"}`}>
                {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                {t(`skip.${r}`)}
              </button>
            );
          })}
        </div>
        <Unfold open={sel.length > 0}>
          <div className="space-y-3.5 border-t border-border pt-3.5">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("wr.basedOn", { reasons: sel.map((r) => t(`skip.${r}`)).join(", ") })}</p>
              <div className="space-y-1 rounded-md border border-primary bg-accent p-3 text-accent-foreground">
                <p className="text-sm font-semibold">{t(`wr.rec.${rec}`)}</p>
                <p className="text-xs">{t(`wr.rec.${rec}.body`)}</p>
              </div>
              {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </div>
            <div className="space-y-1 rounded-md bg-muted p-3">
              <p className="text-xs font-semibold">{t("wr.effect")}</p>
              <p className="text-xs text-muted-foreground">
                {block ? t("wr.effect.extend", { from: t("plan.weekShort", { week: endWeek }), to: t("plan.weekShort", { week: endWeek + 1 }) }) : t("wr.effect.noBlock")} {t("wr.effect.plan")}
              </p>
            </div>
            <div className="flex gap-2">
              <BusyButton className="flex-1" busy={accept.busy} onClick={() => accept.run()}>{t("wr.accept")}</BusyButton>
              <Button variant="outline" className="flex-1" onClick={onIgnore}>{t("wr.ignore")}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("wr.nothing")}</p>
            <ErrorText>{accept.error}</ErrorText>
          </div>
        </Unfold>
      </div>
      {planning && block && (
        <ReplanDialog block={block} options={{ extend: 1, thisWeek: true, light: rec === "light" }}
          onClose={() => setPlanning(false)} onSaved={() => { setPlanning(false); onDone(); }} />
      )}
      {planning && !block && (
        <SuggestWeekDialog weekStart={data.week.weekStart} light={rec === "light"} onClose={() => { setPlanning(false); onDone(); }}
          onApplied={() => { setPlanning(false); onDone(); }} />
      )}
    </Card>
  );
}
