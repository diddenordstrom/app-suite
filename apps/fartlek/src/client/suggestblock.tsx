import { useMemo, useState, type ReactNode } from "react";
import { PhaseWarningsNote, RacePaceCard, RacePaceNote } from "./racepace";
import { phaseWarnings, type RacePaceView } from "@/shared/racephase";
import { api, useApi } from "./http";
import { lang, t, tn, WEEKDAY_LONG } from "./i18n";
import { useFmt } from "./prefs";
import { Badge, Button, Dialog, ErrorText, Field, Input, Select, Spinner, cn } from "./ui";
import { blockName, fmtDay } from "./bits";
import { MoreDays, PILL, signed, signedInt, SimLines, skipVerdict, type Line, type Tone } from "./suggestweek";
import { BlockWarnings, useBlockWeeks, WeekEditor } from "./blockeditor";
import { RaceRoad } from "./raceroad";
import type { RaceRoad as Road } from "@/shared/raceplan";
import { addDays, weekNumber, weekday, type ISODate } from "@/shared/dates";
import { sessionText } from "@/shared/blocktext";
import { BLOCK, evaluateBlock, weekKm, type BlockEval, type BlockSeed, type BlockSuggestion, type BlockTry, type RaceChunk, type WeekRole } from "@/shared/blockplan";
import { diffPlans, workoutWeeks, type DayChange, type PlanDiff } from "@/shared/planrange";
import { COACH } from "@/shared/coach";
import { FORM, formPct, formState } from "@/shared/load";
import type { DaysAdvice, SuggestItem } from "@/shared/nextweek";
import type { Block, BlockKind, Workout } from "@/shared/types";

/*
 * "Skapa block" and "Räkna om resten" (docs/decisions/fartlek-block-goals.md, docs/decisions/fartlek-skapa-block.md).
 * Creating takes two steps: where the runner stands (form, volume, races), the block's name, start and rhythm, and
 * whether the coach suggests the weeks or the runner builds them; then one editor for both, the weeks as columns with
 * the numbers beside them. Every edit re-evaluates the block in a chain from the seed; nothing blocks "Use", the
 * numbers only colour.
 */

type Race = { name: string; date: ISODate };
type SugBase = { startWeek: ISODate; defaultStart: ISODate; earliest: ISODate; today: ISODate; weeks: number };
/** A race ahead that decides the weeks (docs/decisions/fartlek-race-blocks.md): its blocks counted back, and how many are planned now. */
type RacePlan = { race: Race & { priority: "A" | "B" }; weeksToRace: number; chunks: (RaceChunk & { blockKind?: BlockKind })[]; now: number };
type SugOk = SugBase & { ok: true; seed: BlockSeed; suggestion: BlockSuggestion; replaces: Workout[]; race: Race | null; advice: DaysAdvice | null; racePlan: RacePlan | null;
  /** Days before `today` in a block that starts in the running week are over: locked, with the km run. */
  doneDays: Record<ISODate, number>; racePace: RacePaceView | null;
  /** The race the first weeks recover from (docs/decisions/fartlek-post-race-recovery.md); null without recovery weeks. */
  recovery: { name: string; date: ISODate; distanceKm: number; priority: "A" | "B"; weeks: number } | null;
  /** The road to an A marathon or half (docs/decisions/fartlek-race-plan-skeleton.md), a break before the block, and a plan race beyond its window. */
  road: Road | null; back: { days: number; km: number } | null; farRace: { name: string; date: ISODate; weeksToRace: number; planFrom: ISODate } | null };
type SugRes = SugBase & (
  | { ok: false; reason: "block"; block: Block }
  | { ok: false; reason: "race"; race: Race }
  | Omit<SugOk, keyof SugBase>);

/** What "Använd blocket" wrote and what it replaced, for undo. */
export interface BlockApplied { id: number; blockIds?: number[]; ids: number[]; removed: Workout[]; targetsBefore: unknown[]; planBefore?: unknown[]; from: ISODate; to: ISODate }

const stepLang = lang === "sv" ? "sv" : "en";
const growthPct = Math.round((COACH.weekGrowth - 1) * 100);
const pctText = (g: number | null) => (g == null ? "" : `${signedInt(g * 100)} %`);
const lastWeekOf = (seed: Pick<BlockSeed, "startWeek" | "weeks">) => addDays(seed.startWeek, (seed.weeks - 1) * 7);

/** The rhythm of a block: build weeks, then one lighter week. 1:1 needs the engine told (`rhythm=1:1`): it has no lighter week under three. */
type Rhythm = "1:1" | "2:1" | "3:1";
const RHYTHMS: { r: Rhythm; build: number }[] = [{ r: "1:1", build: 1 }, { r: "2:1", build: 2 }, { r: "3:1", build: 3 }];
const buildOf = (r: Rhythm) => RHYTHMS.find((x) => x.r === r)!.build;
type Mode = "suggest" | "own";

export function CreateBlockDialog({ onClose, onApplied }: { onClose: () => void; onApplied: (a: BlockApplied) => void }) {
  const [rhythm, setRhythm] = useState<Rhythm>("3:1");
  // Weeks added by the tired-start prompt: a lighter week first, then the rhythm in full.
  const [extra, setExtra] = useState(0);
  const [start, setStart] = useState<ISODate | null>(null);
  const [mode, setMode] = useState<Mode>("suggest");
  // The first block's name: null until the runner types one, then the default follows the plan (a race block's own name).
  const [typed, setName] = useState<string | null>(null);
  // `rev` makes a new request after a run day was added, so the block is simulated again with it.
  const [rev, setRev] = useState(0);
  const [step, setStep] = useState<"start" | "sim" | "days" | "edit">("start");
  const weeks = buildOf(rhythm) + 1 + extra;
  const { data, error, loading } = useApi<SugRes>(`/plan/block-suggest?weeks=${weeks}&rhythm=${rhythm}${start ? `&startWeek=${start}` : ""}&r=${rev}`);
  const ok = data?.ok ? (data as SugOk) : null;
  const rp = ok?.racePlan ?? null;
  const nowChunks = rp ? rp.chunks.slice(0, rp.now) : [];
  const name = typed ?? (rp && nowChunks[0] ? chunkName(nowChunks[0], rp) : t("blk.focusDefault"));
  // Two race blocks planned together (the last build and the form peak): the title names both, with their rhythms.
  const titleName = nowChunks.length > 1
    ? nowChunks.map((c, i) => chunkTitle(c, i === 0 ? name.trim() || t("blk.focusDefault") : c.kind === "peak" ? t("be.race.peakShort") : chunkName(c, rp!))).join(" + ")
    : name.trim() || t("blk.focusDefault");
  const title = step !== "start" && ok ? t("be.titleWeeks", { name: titleName, from: weekNumber(ok.startWeek), to: weekNumber(lastWeekOf(ok.seed)) }) : t("be.title");
  const picker = data ? <StartPicker value={data.startWeek} first={data.earliest} today={data.today} onChange={setStart} busy={loading} /> : null;
  return (
    <Dialog open onClose={onClose} title={title} className={step === "edit" ? "sm:max-w-[min(100rem,96vw)]" : "sm:max-w-3xl"}>
      <StepDots step={step === "start" ? 1 : 2} />
      <ErrorText>{error}</ErrorText>
      {step === "start" && (
        <StartStep data={data} loading={loading} rhythm={rhythm} onRhythm={(r) => { setRhythm(r); setExtra(0); }} onChanged={() => setRev(rev + 1)}
          name={name} onName={setName} mode={mode} onMode={setMode} picker={picker} onClose={onClose}
          onNext={() => setStep(mode === "suggest" ? "sim" : "edit")} />
      )}
      {step !== "start" && (!data || loading) && <Spinner className="text-muted-foreground" />}
      {ok && !loading && step !== "start" && ok.racePace?.question && <RacePaceCard view={ok.racePace} onAnswered={() => setRev(rev + 1)} />}
      {ok && !loading && step !== "start" && !ok.racePace?.question && ok.racePace && step !== "sim" && <RacePaceNote view={ok.racePace} />}
      {ok && !loading && !ok.racePace?.question && step === "sim" && <BlockSim seed={ok.seed} s={ok.suggestion} onDone={() => setStep(ok.advice ? "days" : "edit")} />}
      {ok && !loading && !ok.racePace?.question && step === "days" && ok.advice && (
        <MoreDays advice={ok.advice} onAdded={() => { setRev(rev + 1); setStep("sim"); }} onSkip={() => setStep("edit")} />
      )}
      {ok && !loading && !ok.racePace?.question && step === "edit" && (
        <BlockEditor key={`${ok.startWeek}-${ok.weeks}-${mode}-${rev}`} res={ok} own={mode === "own"} rhythm={rhythm} extended={extra > 0}
          onExtend={() => setExtra(extra + 1)} onUnextend={() => setExtra(0)} onBack={() => setStep("start")} onClose={onClose}
          names={nowChunks.length > 1 ? nowChunks.map((c, i) => (i === 0 ? name.trim() : chunkName(c, rp!))) : null}
          onApply={async (items, roles) => {
            // A race plan saves each of its blocks; else one block of all the weeks.
            const blocks = nowChunks.length > 0 ? nowChunks.map((c, i) => ({ weeks: c.weeks, kind: c.blockKind ?? c.kind, name: i === 0 ? name.trim() : chunkName(c, rp!) })) : undefined;
            const r = await api<Omit<BlockApplied, "from" | "to">>("/plan/block-suggest", {
              body: { startWeek: ok.startWeek, weeks: items, roles, blocks, name: name.trim(), replace: ok.replaces.map((w) => w.id) },
            });
            onApplied({ ...r, from: ok.startWeek, to: addDays(ok.startWeek, items.length * 7 - 1) });
          }} />
      )}
    </Dialog>
  );
}

function StepDots({ step }: { step: 1 | 2 }) {
  const dot = (n: 1 | 2, label: string) => (
    <li aria-current={step === n ? "step" : undefined} className={cn("flex items-center gap-2", step === n ? "font-semibold text-foreground" : "text-muted-foreground")}>
      <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs", step === n ? "bg-primary text-primary-foreground" : step > n ? "bg-accent text-accent-foreground" : "border border-border")}>{step > n ? "✓" : n}</span>
      {label}
    </li>
  );
  return <ol className="mb-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-3 text-sm">{dot(1, t("be.step1"))}{dot(2, t("be.step2"))}</ol>;
}

/** A race block's rhythm from its roles, "3:1" or "2:2" (build weeks : the rest); none for a block of one kind of week. */
const chunkRhythm = (c: RaceChunk) => {
  const build = c.roles.filter((r) => r === "build").length;
  return build > 0 && build < c.roles.length ? `${build}:${c.roles.length - build}` : null;
};
const chunkTitle = (c: RaceChunk, name: string) => {
  const rhythm = chunkRhythm(c);
  return rhythm ? t("be.race.chunkTitle", { name, rhythm }) : name;
};

/** A race plan's block name: "Formtopp <race>" for the form peak, "Uppbyggnad" and "I fas" for those before it. */
const chunkName = (c: RaceChunk, rp: RacePlan) => (c.kind === "peak" ? t("be.race.peakName", { name: rp.race.name }) : t(c.kind === "build" ? "be.race.buildName" : "be.race.inPhaseName"));

/* ---------- Step 1: where the runner stands, and the block's frame ---------- */

function Tile1({ label, value, sub, tone }: { label: string; value: ReactNode; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className="space-y-0.5 rounded-lg bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums", tone === "ok" && "text-success", tone === "warn" && "text-warning")}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function StartStep({ data, loading, rhythm, onRhythm, onChanged, name, onName, mode, onMode, picker, onClose, onNext }: {
  data: SugRes | null | undefined; loading: boolean; rhythm: Rhythm; onRhythm: (r: Rhythm) => void; onChanged: () => void; name: string; onName: (v: string) => void;
  mode: Mode; onMode: (m: Mode) => void; picker: ReactNode; onClose: () => void; onNext: () => void;
}) {
  const fmt = useFmt();
  if (!data) return <Spinner className="text-muted-foreground" />;
  if (!data.ok) {
    return (
      <div className="space-y-3">
        {picker}
        <p className="text-sm text-muted-foreground">
          {data.reason === "block" ? t("blk.refused.block", { name: blockName(data.block) })
            : t("blk.refused.race", { name: data.race.name, date: fmtDay(data.race.date, { day: "numeric", month: "short", year: "numeric" }), weeks: BLOCK.raceWindowWeeks })}
        </p>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button></div>
      </div>
    );
  }
  const { seed, race, racePlan: rp, recovery, road, back, farRace } = data as SugOk;
  const form = seed.ctl - seed.atl;
  // A lighter first week is either heavy form (tired) or asked for (a backoff target, or a lighter start from the check-in).
  const lighter = !!seed.lighterFirst;
  const tired = lighter && (seed.lighterFirstWhy ?? "form") === "form";
  const state = formState(form, seed.ctl);
  const pctText = `${signedInt(formPct(form, seed.ctl))} %`;
  const avg = seed.kmBefore.length ? seed.kmBefore.reduce((a, b) => a + b, 0) / seed.kmBefore.length : 0;
  const tol = seed.tolerance;
  const weeks = buildOf(rhythm) + 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile1 label={t("be.read.form")} value={signed(form)} tone={state === "heavy" ? "warn" : state === "fresh" || state === "balanced" ? "ok" : undefined}
          sub={`${pctText} · ${t(`load.state.${state}`)}`} />
        <Tile1 label={t("be.read.avg", { n: seed.kmBefore.length })} value={fmt.dist(avg)} sub={t("be.read.avgSub")} />
        <Tile1 label={t("be.read.peak")} value={tol.km > 0 && tol.peakWeek ? fmt.dist(tol.peakKm, 0) : "–"} sub={tol.km > 0 && tol.peakWeek ? t("plan.weekShort", { week: weekNumber(tol.peakWeek) }) : t("be.read.peakNone")} />
        <Tile1 label={t("blk.stat.race")} value={race ? race.name : "–"} sub={race ? fmtDay(race.date, { day: "numeric", month: "short", year: "numeric" }) : t("be.read.raceNone")} />
      </div>

      <div className={cn("flex gap-3 rounded-lg px-4 py-3", tired ? "border border-warning/40 bg-warning/10" : "bg-accent")}>
        {/* tired = heavy form; a lighter week for the rhythm reads as plain advice */}
        <svg viewBox="0 0 24 24" className={cn("mt-0.5 size-5 shrink-0", tired ? "text-warning" : "text-accent-foreground")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {tired ? <><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.5" /></> : <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />}
        </svg>
        <div className="space-y-1">
          <div className={cn("font-semibold", tired ? "text-warning" : "text-accent-foreground")}>
            {rp ? t("be.read.raceTitle", { name: rp.race.name, weeks: rp.weeksToRace }) : lighter ? t(`be.read.lighter.${tired ? "form" : "asked"}Title`) : t("be.read.buildTitle", { weeks: BLOCK.raceWindowWeeks })}
          </div>
          <p className="text-sm">
            {rp ? t(rp.race.priority === "B" ? "be.read.raceB" : rp.now > 1 || rp.chunks.length === 1 ? "be.read.raceNear" : "be.read.raceFar")
              : lighter ? t(`be.read.lighter.${tired ? "form" : "asked"}Text`, { form: pctText }) : t("be.read.buildText", { dist: fmt.dist(avg, 0) })}
            {rp && tired && ` ${t("be.read.raceTired")}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("be.name")} className="min-w-56 flex-1"><Input value={name} maxLength={60} onChange={(e) => onName(e.target.value)} /></Field>
        {picker}
      </div>

      {back && <p className="text-sm text-muted-foreground">{t("road.back", { days: back.days, km: fmt.dist(back.km) })}</p>}
      {farRace && <p className="text-sm text-muted-foreground">{t("road.far", { race: farRace.name, weeks: tn("be.weeksN", farRace.weeksToRace), week: weekNumber(farRace.planFrom) })}</p>}
      {road ? <RaceRoad road={road} onChanged={onChanged} /> : rp ? <RacePlanView rp={rp} start={data.startWeek} /> : recovery && recovery.weeks > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("blk.recovery.note", { name: recovery.name, date: fmtDay(recovery.date, { day: "numeric", month: "short" }), weeks: tn("be.weeksN", recovery.weeks) })}
        </p>
      ) : (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("be.rhythm")}</legend>
        <p className="text-sm text-muted-foreground">{t("be.rhythm.intro")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {RHYTHMS.map(({ r, build }) => {
            const on = r === rhythm;
            return (
              <label key={r} className={cn("flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3", on ? "border-primary ring-1 ring-primary" : "border-border")}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="rhythm" checked={on} onChange={() => onRhythm(r)} className="accent-[var(--primary)]" />
                  <span className="font-semibold">{r}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{tn("be.weeksN", build + 1)}</span>
                  {r === "3:1" && <Badge className="ml-auto">{t("be.rhythm.common")}</Badge>}
                </span>
                <span aria-hidden className="flex h-6 items-end gap-0.5">
                  {Array.from({ length: build }, (_, i) => <span key={i} className="flex-1 rounded-sm bg-signature" style={{ height: `${50 + i * 20}%` }} />)}
                  <span className="flex-1 rounded-sm bg-signature opacity-45" style={{ height: "40%" }} />
                </span>
                <span className="text-xs text-muted-foreground">{t(`be.rhythm.${r.replace(":", "")}` as "be.rhythm.31")}</span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {lighter ? t("be.rhythm.tired", { weeks: weeks + 1, rhythm })
            : t("be.rhythm.span", { weeks, from: weekNumber(data.startWeek), to: weekNumber(addDays(data.startWeek, (weeks - 1) * 7)) })}
        </p>
      </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("be.how")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["suggest", "own"] as const).map((m) => (
            <label key={m} className={cn("flex cursor-pointer gap-3 rounded-lg border bg-card p-3", mode === m ? "border-primary ring-1 ring-primary" : "border-border")}>
              <input type="radio" name="mode" checked={mode === m} onChange={() => onMode(m)} className="mt-1 accent-[var(--primary)]" />
              <span className="space-y-0.5"><span className="block font-semibold">{t(`be.mode.${m}`)}</span><span className="block text-sm text-muted-foreground">{t(`be.mode.${m}Sub`)}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={onNext} disabled={loading}>{loading ? <Spinner /> : mode === "suggest" ? t("blk.button") : `${t("be.mode.own")} →`}</Button>
      </div>
    </div>
  );
}

/** The blocks counted back from the race, week by week, those planned now marked; and a line on what comes after. */
function RacePlanView({ rp, start }: { rp: RacePlan; start: ISODate }) {
  const color: Record<WeekRole, string> = { build: "bg-signature", lighter: "bg-signature opacity-45", taper: "bg-chart-4", race: "bg-chart-4", recovery: "bg-signature opacity-30" };
  const height: Record<WeekRole, string> = { build: "70%", lighter: "40%", taper: "45%", race: "30%", recovery: "25%" };
  let week = 0;
  const later = rp.chunks.slice(rp.now);
  return (
    <section className="space-y-2" aria-label={t("be.race.plan")}>
      <div className="text-sm font-medium">{t("be.race.plan")}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rp.chunks.map((c, k) => {
          const from = week; week += c.weeks;
          const now = k < rp.now;
          return (
            <div key={k} className={cn("min-w-24 flex-1 space-y-1.5 rounded-lg border p-2.5", now ? "border-primary bg-card ring-1 ring-primary" : "border-dashed border-border")} style={{ flexGrow: c.weeks }}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold">{chunkName(c, rp)}</span>
                <span className="whitespace-nowrap text-muted-foreground">{t("be.race.span", { from: weekNumber(addDays(start, from * 7)), to: weekNumber(addDays(start, (from + c.weeks - 1) * 7)) })}</span>
              </div>
              <div aria-hidden className="flex h-8 items-end gap-0.5">
                {c.roles.map((r, i) => <span key={i} className={cn("flex-1 rounded-sm", color[r])} style={{ height: height[r] }} />)}
              </div>
              <div className="text-[11px] text-muted-foreground">{c.roles.map((r) => t(ROLE_SHORT[r])).join(" · ")}</div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {later.length ? t("be.race.later", { now: tn("be.weeksN", rp.chunks[0].weeks), after: later.map((c) => `${chunkName(c, rp).toLowerCase()} ${tn("be.weeksN", c.weeks)}`).join(", ") })
          : t("be.race.together", { race: rp.race.name, date: fmtDay(rp.race.date, { day: "numeric", month: "short" }) })}
      </p>
    </section>
  );
}
const ROLE_SHORT = { build: "be.role.build", lighter: "be.role.lighter", taper: "be.role.taper", race: "be.role.race", recovery: "be.role.recovery" } as const;

/* ---------- The simulation lines ---------- */

type Fmt = ReturnType<typeof useFmt>;
const weeksText = (fmt: Fmt, weeks: string | number) =>
  `${String(weeks).split(" → ").map((x) => fmt.num(Number(x))).join(" → ")} ${fmt.unit}`;

function tryLine(tr: BlockTry, fmt: Fmt): Line | null {
  if (tr.id === "read") return null;
  const form = tr.form == null ? "" : signed(tr.form);
  const weeks = tr.id === "second" ? tr.params.weeks ?? 1 : tr.params.weeks != null ? weeksText(fmt, tr.params.weeks) : "";
  const p = { ...tr.params, form, weeks, goal: typeof tr.params.goal === "number" ? fmt.dist(tr.params.goal) : "",
    pace: typeof tr.params.pace === "number" ? fmt.pace(tr.params.pace) : "" };
  if (tr.state === "skip") {
    return { text: t("blk.try.second", { ...p, weeks: 1 }).replace(/ → .*$/, ""), verdict: skipVerdict(tr.params), tone: "info" };
  }
  const plain = tr.id === "start";
  return { text: t(`blk.try.${tr.id}` as "blk.try.volume", p), verdict: plain ? null : t(`next.v.${tr.state as "ok"}`), tone: tr.state === "ok" ? "ok" : plain ? "info" : "no" };
}

function useSimLines(seed: BlockSeed, s: BlockSuggestion): Line[] {
  const fmt = useFmt();
  return useMemo(() => {
    const tol = seed.tolerance;
    const longDay = WEEKDAY_LONG[seed.longRunDay].toLowerCase();
    const info = (text: string): Line => ({ text, verdict: null, tone: "info" });
    return [
      info(t("blk.try.read", { dist: fmt.dist(seed.kmBefore.at(-1) ?? 0), form: signed(seed.ctl - seed.atl) })),
      info(tol.km > 0 && tol.peakWeek
        ? t("blk.try.peak", { dist: fmt.dist(tol.peakKm), week: weekNumber(tol.peakWeek), tol: fmt.dist(tol.km) })
        : t("blk.try.noPeak", { pct: growthPct })),
      ...s.tries.flatMap((tr) => tryLine(tr, fmt) ?? []),
      { text: t("blk.try.place", { day: longDay }), verdict: null, tone: "ok" },
    ];
  }, [seed, s, fmt]);
}

function BlockSim({ seed, s, onDone }: { seed: BlockSeed; s: BlockSuggestion; onDone: () => void }) {
  return <SimLines lines={useSimLines(seed, s)} running={t("blk.sim.running")} onDone={onDone} />;
}

/** The week the block starts: the first one open (the running week, from today, when it is free) or one of the eleven after it. */
function StartPicker({ value, first, today, onChange, busy }: { value: ISODate; first: ISODate; today: ISODate; onChange: (v: ISODate) => void; busy: boolean }) {
  const options = Array.from({ length: 12 }, (_, i) => addDays(first, i * 7));
  return (
    <Field label={t("blk.start")} className="w-44">
      <Select value={value} disabled={busy} onChange={(e) => onChange(e.target.value)}>
        {options.map((ws) => <option key={ws} value={ws}>{`${t("plan.weekShort", { week: weekNumber(ws) })} · ${ws <= today ? t("blk.startToday") : fmtDay(ws, { day: "numeric", month: "short" })}`}</option>)}
      </Select>
    </Field>
  );
}

/* ---------- Step 2: the editor ---------- */

/** The editor's two columns: the weeks, and the numbers and charts that follow every edit. */
function TwoColumns({ weeks, panel, ev }: { weeks: ReactNode; panel: ReactNode; ev: BlockEval }) {
  const fmt = useFmt();
  const [aside, setAside] = useState<HTMLElement | null>(null);
  const peak = Math.max(0, ...ev.weeks.map((w) => w.km));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-3">{weeks}</div>
      <aside ref={setAside} className="space-y-3 xl:sticky xl:top-0 xl:self-start">{panel}</aside>
      {/* Narrower screens put the numbers under the weeks: a bar at the bottom keeps the main ones in sight. */}
      <button type="button" onClick={() => aside?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="sticky bottom-0 z-10 flex items-center gap-3 rounded-lg border border-card-edge bg-card shadow-card px-3 py-2 text-left text-sm tabular-nums shadow-lg xl:hidden">
        <span className="flex flex-1 flex-wrap gap-x-3">
          <span><strong>{fmt.dist(ev.km, 0)}</strong></span>
          <span>{t("be.bar.peak")} <strong>{fmt.dist(peak, 0)}</strong></span>
          {ev.deepest && <span>{t("next.stat.form")} <strong className={ev.state === "over" ? "text-danger" : undefined}>{signed(ev.deepest.form)}</strong></span>}
        </span>
        <span className="text-xs font-medium text-primary">{t("be.bar.more")}</span>
      </button>
    </div>
  );
}

function BlockEditor({ res, own, rhythm, extended, names, onExtend, onUnextend, onBack, onClose, onApply }: {
  res: SugOk; own: boolean; rhythm: Rhythm; extended: boolean; onExtend: () => void; onUnextend: () => void;
  /** The blocks' names when the weeks are more than one block (a race plan), in order. */
  names: string[] | null;
  onBack: () => void; onClose: () => void; onApply: (items: SuggestItem[][], roles: WeekRole[]) => Promise<void>;
}) {
  const fmt = useFmt();
  const { seed, suggestion: s, replaces, race } = res;
  const rp = res.racePlan;
  const start = useMemo(() => (own ? s.weeks.map(() => [] as SuggestItem[]) : s.weeks.map((w) => w.items)), [s, own]);
  const startRoles = useMemo(() => s.weeks.map((w) => w.role), [s]);
  const b = useBlockWeeks(seed, start, startRoles);
  // Where each planned block starts, for the labels over the weeks.
  const labels = useMemo(() => {
    if (!names || !rp) return undefined;
    const out: Record<number, string> = {};
    let at = 0;
    rp.chunks.slice(0, rp.now).forEach((c, i) => { out[at] = names[i]; at += c.weeks; });
    return out;
  }, [names, rp]);
  const ev = useMemo(() => evaluateBlock(b.seed, b.weeks), [b.seed, b.weeks]);
  // The race phase's warnings follow the weeks as they are edited.
  const phaseWarn = useMemo(() => (b.seed.phase ? phaseWarnings(b.weeks.map((items, i) => ({
    weekStart: addDays(b.seed.startWeek, i * 7), build: b.roles[i] === "build", km: weekKm(items),
    longKm: items.filter((it) => it.type === "long").reduce<number | null>((m, it) => (m == null || it.km > m ? it.km : m), null),
  })), b.seed.phase) : null), [b.seed, b.weeks, b.roles]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  // A tired start makes the first week lighter; the block then needs one more week to end lighter as the rhythm says.
  const offerExtend = !rp && !!seed.lighterFirst && !extended && !kept && !b.lighter[b.n - 1] && b.n < BLOCK.maxEditWeeks;
  const apply = async () => {
    setBusy(true); setErr(null);
    try { await onApply(b.weeks, b.roles); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="space-y-4">
      {res.road && <RaceRoad road={res.road} compact />}
      {offerExtend && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <div className="min-w-0 flex-1 basis-80 space-y-0.5">
            <div className="font-semibold text-warning">{t(seed.lighterFirstWhy === "asked" || seed.lighterFirstWhy === "light" ? "be.tired.titleAsked" : "be.tired.title")}</div>
            <p className="text-sm">{t("be.tired.text", { weeks: b.n + 1, rhythm })}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setKept(true)}>{tn("be.tired.keep", b.n)}</Button>
            <Button onClick={onExtend}>{tn("be.tired.extend", b.n + 1)}</Button>
          </div>
        </div>
      )}
      {extended && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success/15 px-4 py-2 text-sm text-success">
          <span>{t("be.tired.done", { weeks: b.n, rhythm })}</span>
          <Button variant="outline" className="h-8" onClick={onUnextend}>{t("next.undo")}</Button>
        </div>
      )}
      {s.shortBy > 0 && !own && !b.changed && <p className="text-xs text-muted-foreground">{t("blk.shortBy", { dist: fmt.dist(s.goalKm, 0) })}</p>}
      <TwoColumns ev={ev}
        weeks={<>
          <p className="text-sm text-muted-foreground">{own ? t("be.ownIntro") : t("blk.intro")}</p>
          <WeekEditor b={b} ev={ev} plan={s.weeks} canResize={!rp} canRetype fillAdded={!own} labels={labels}
            lockedBefore={res.today} doneKm={res.doneDays} />
        </>}
        panel={<>
          {ev.race && rp && <RaceForm ev={ev} name={rp.race.name} />}
          <BlockStats seed={b.seed} ev={ev} race={race} panel towardRace={!!rp} />
          <BlockWarnings ev={ev} />
          <PhaseWarningsNote warnings={phaseWarn} />
          <BlockCharts seed={b.seed} ev={ev} stacked />
        </>} />
      <Footer seed={b.seed} s={s} weeks={b.weeks} edited={b.changed} busy={busy} replaces={replaces.length} onBack={onBack}
        onClose={onClose} onReset={b.reset} onApply={() => void apply()} applyLabel={t("blk.apply")} />
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

/* ---------- Numbers and charts ---------- */

function Tile({ label, value, sub, tone = "ok", badge }: { label: string; value: string; sub: string; tone?: Tone; badge?: string }) {
  return (
    <div className="space-y-0.5 rounded-lg border border-card-edge bg-card shadow-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      {badge && <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tone === "ok" ? "bg-success/15 text-success" : PILL[tone])}>{badge}</span>}
    </div>
  );
}

function BlockStats({ seed, ev, race, panel, towardRace }: { seed: BlockSeed; ev: BlockEval; race: Race | null; panel?: boolean; towardRace?: boolean }) {
  const fmt = useFmt();
  const tol = seed.tolerance;
  // Calm (above the build band) is fine: form is a guard, not a target.
  const tone: Tone = ev.state === "over" ? "bad" : "ok";
  return (
    <div className={cn("grid grid-cols-2 gap-2", !panel && "md:grid-cols-4")}>
      <Tile label={t("blk.stat.goal")} value={fmt.dist(ev.km, 0)} sub={t("blk.stat.goalSub", { from: Math.round(seed.ctl), to: Math.round(ev.ctl) })} />
      <Tile label={t("blk.stat.tol")} value={tol.km > 0 && tol.peakWeek ? t("blk.stat.tolValue", { dist: fmt.dist(tol.peakKm, 0), week: weekNumber(tol.peakWeek) }) : "–"}
        sub={tol.km > 0 ? t("blk.stat.tolSub", { pct: growthPct }) : t("blk.stat.tolNone", { pct: growthPct })} />
      <Tile label={ev.deepest ? t("blk.stat.deepest", { week: weekNumber(ev.deepest.weekStart) }) : t("next.stat.form")}
        value={ev.deepest ? signed(ev.deepest.form) : "–"} sub={ev.deepest ? t("next.stat.formSub", { pct: Math.round(ev.deepest.formPct), value: signed(seed.ctl - seed.atl) }) : ""}
        tone={tone} badge={t(`blk.b.${ev.state}` as "blk.b.ok")} />
      <Tile label={t("blk.stat.race")} value={race ? race.name : "–"}
        sub={race ? `${fmtDay(race.date, { day: "numeric", month: "short", year: "numeric" })} · ${t(towardRace ? "be.race.toward" : "blk.stat.raceFar")}` : t("blk.stat.raceNone")} />
    </div>
  );
}

const W = 340, H = 150;

function BlockCharts({ seed, ev, stacked }: { seed: BlockSeed; ev: BlockEval; stacked?: boolean }) {
  const fmt = useFmt();
  const past = seed.past.slice(-Math.max(2, 7 - seed.weeks));
  // Form as a share of fitness, the scale the band is drawn and judged on.
  const pts = [...past.map((p) => ({ ws: p.weekStart, km: p.km, form: formPct(p.ctl - p.atl, p.ctl), block: false, lighter: false })),
    ...ev.weeks.map((w) => ({ ws: w.weekStart, km: w.km, form: w.formPct, block: true, lighter: w.lighter }))];
  const n = pts.length;
  const dx = (W - 40) / Math.max(1, n - 1);
  const x = (i: number) => 20 + i * dx;
  const wk = (ws: ISODate) => t("plan.weekShort", { week: weekNumber(ws) });
  const labels = pts.map((p, i) => <text key={p.ws} x={x(i)} y={H - 4} fontSize={10} textAnchor="middle" fill={p.block ? "var(--foreground)" : "var(--muted-foreground)"} fontWeight={p.block ? 600 : 400}>{wk(p.ws)}</text>);
  const yForm = (v: number) => Math.min(128, Math.max(4, 30 + -v * 2.4));
  const firstBlock = past.length;
  const line = (from: number, to: number) => pts.slice(from, to).map((p, k) => `${x(from + k)},${yForm(p.form).toFixed(1)}`).join(" ");
  const tol = seed.tolerance.km;
  const kmTop = Math.max(20, tol, ...pts.map((p) => p.km)) * 1.15;
  const yKm = (v: number) => 128 - (v / kmTop) * 118;
  const deep = ev.deepest ? pts.findIndex((p) => p.ws === ev.deepest!.weekStart) : -1;
  const card = "space-y-1 rounded-lg border border-card-edge bg-card shadow-card p-3";
  const bar = Math.min(28, dx * 0.6);
  return (
    <div className={cn("grid gap-2", !stacked && "md:grid-cols-2")}>
      <figure className={card}>
        <figcaption className="text-sm font-semibold">{t("blk.chart.form")}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
          aria-label={t("blk.aria.form", { list: ev.weeks.map((w) => `${wk(w.weekStart)} ${Math.round(w.formPct)} %`).join(", "), goal: signedInt(COACH.goal), heavy: signedInt(FORM.heavy) })}>
          <rect x={8} y={yForm(COACH.goal)} width={W - 16} height={yForm(FORM.heavy) - yForm(COACH.goal)} fill="var(--signature-soft)" />
          <text x={12} y={yForm(COACH.goal) + 12} fontSize={10} fill="var(--signature-foreground)">{t("next.chart.band")}</text>
          <line x1={20} x2={W - 20} y1={yForm(0)} y2={yForm(0)} stroke="var(--border)" />
          <text x={W - 4} y={yForm(0) + 3} fontSize={10} textAnchor="end" fill="var(--muted-foreground)">0</text>
          {firstBlock > 1 && <polyline points={line(0, firstBlock)} fill="none" stroke="var(--chart-4)" strokeWidth={2.2} strokeLinejoin="round" />}
          <polyline points={line(Math.max(0, firstBlock - 1), n)} fill="none" stroke="var(--chart-4)" strokeWidth={2.2} strokeDasharray="4 4" />
          {deep >= 0 && <circle cx={x(deep)} cy={yForm(pts[deep].form)} r={4} fill="var(--chart-4)" />}
          {labels}
        </svg>
      </figure>
      <figure className={card}>
        <figcaption className="text-sm font-semibold">{t("blk.chart.km")}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t("blk.aria.km", { list: pts.map((p) => `${wk(p.ws)} ${fmt.dist(p.km)}`).join(", ") })}>
          <line x1={6} x2={W - 6} y1={128} y2={128} stroke="var(--border)" />
          {tol > 0 && <>
            <line x1={6} x2={W - 6} y1={yKm(tol)} y2={yKm(tol)} stroke="var(--signature-foreground)" strokeWidth={1.2} strokeDasharray="3 3" />
            <text x={8} y={yKm(tol) - 4} fontSize={10} fill="var(--signature-foreground)">{t("blk.chart.peak", { dist: fmt.dist(tol, 0) })}</text>
          </>}
          {pts.map((p, i) => (
            <rect key={p.ws} x={x(i) - bar / 2} y={yKm(p.km)} width={bar} height={Math.max(0, 128 - yKm(p.km))} rx={2}
              fill={p.block ? "var(--signature)" : "var(--muted-foreground)"} fillOpacity={p.block ? (p.lighter ? 0.55 : 1) : 0.35} />
          ))}
          {pts.map((p, i) => p.block && <text key={p.ws} x={x(i)} y={yKm(p.km) - 5} fontSize={10} fontWeight={600} textAnchor="middle" fill="var(--foreground)">{fmt.num(p.km)}</text>)}
          {labels}
        </svg>
      </figure>
    </div>
  );
}

/* ---------- Footer: block text, how it chose, buttons ---------- */

function Footer({ seed, s, weeks, edited, busy, replaces, onBack, onClose, onReset, onApply, applyLabel }: {
  seed: BlockSeed; s: BlockSuggestion; weeks: SuggestItem[][]; edited: boolean; busy: boolean; replaces: number;
  onBack?: () => void; onClose: () => void; onReset: () => void; onApply: () => void; applyLabel: string;
}) {
  const fmt = useFmt();
  const lines = useSimLines(seed, s);
  const text = weeks.map((items, i) => `${t("plan.weekShort", { week: weekNumber(addDays(seed.startWeek, i * 7)) })}: ${items.map((x) => sessionText({ type: x.type, distanceKm: x.type === "cross" ? null : x.km, durationMin: x.durationMin, zone2: false, steps: x.steps }, fmt.units, stepLang)).join(", ") || "–"}`).join("\n");
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-2 text-sm">
        <details className="min-w-0">
          <summary className="cursor-pointer text-primary">{t("next.blockText")}</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">{text}</pre>
        </details>
        <details className="min-w-0">
          <summary className="cursor-pointer text-primary">{t("next.how")}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {lines.map((l, i) => <li key={i}>{l.text}{l.verdict ? `: ${l.verdict.toLowerCase()}` : ""}</li>)}
          </ul>
        </details>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {replaces > 0 && <span className="text-xs text-muted-foreground">{tn("blk.replaces", replaces)}</span>}
        {onBack ? <Button variant="outline" onClick={onBack}>← {t("be.back")}</Button> : <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>}
        {edited && <Button variant="outline" onClick={onReset}>{t("next.restore")}</Button>}
        <Button onClick={onApply} disabled={busy || !weeks.some((w) => w.length)}>{busy ? <Spinner /> : applyLabel}</Button>
      </div>
    </div>
  );
}

/* ---------- Re-plan the rest of a block ---------- */

type RpRes =
  | { ok: false; reason: "nothingLeft" }
  | { ok: false; reason: "race"; race: Race }
  | { ok: false; reason: "extendBlocked"; block: Block }
  | { ok: true; block: Block; seed: BlockSeed; suggestion: BlockSuggestion; replaces: Workout[]; diff: PlanDiff; extend: number; compressed: { by: "block" | "race"; name: string } | null; done: { km: number; weeks: number; sick: boolean; days: Record<ISODate, number> }; goal: number | null; before: { weekStart: ISODate; km: number }[]; today: ISODate; race: Race | null; raceDays: ISODate[]; racePace: RacePaceView | null };

/** The input the engine is called with: which weeks, how many to add, lighter or not. "Räkna om resten" is the plain call. */
export interface ReplanOptions { extend?: number; thisWeek?: boolean; light?: boolean; edit?: boolean }

/**
 * "Ändra block" and "Räkna om resten": the same editor over what is left of a block, from the running week, with the
 * days that are over locked. `startWith` "plan" opens it on what is planned now (the engine's re-plan one button away);
 * "engine" opens it on the re-plan, after the simulation.
 */
export function ReplanDialog({ block, options = {}, startWith = "engine", onClose, onSaved }: { block: Block; options?: ReplanOptions; startWith?: "plan" | "engine"; onClose: () => void; onSaved: () => void }) {
  const edit = startWith === "plan";
  const q = [options.extend ? `extend=${options.extend}` : "", options.thisWeek ? "thisWeek=1" : "", options.light ? "light=1" : "", edit ? "edit=1" : ""].filter(Boolean).join("&");
  const [rev, setRev] = useState(0);
  const { data, error } = useApi<RpRes>(`/blocks/${block.id}/replan?${q}${q ? "&" : ""}r=${rev}`);
  const [phase, setPhase] = useState<"sim" | "edit">(startWith === "plan" ? "edit" : "sim");
  return (
    <Dialog open onClose={onClose} title={t(startWith === "plan" ? "be.editTitle" : "rp.title", { name: blockName(block) })} className="sm:max-w-[min(100rem,96vw)]">
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Spinner className="text-muted-foreground" />}
      {data && !data.ok && (
        <p className="text-sm text-muted-foreground">
          {data.reason === "nothingLeft" ? t("rp.nothingLeft")
            : data.reason === "extendBlocked" ? t("rp.extendBlocked", { name: blockName(data.block) })
            : t("rp.race", { name: data.race.name, date: fmtDay(data.race.date, { day: "numeric", month: "short" }) })}
        </p>
      )}
      {data?.ok && data.racePace?.question && <RacePaceCard view={data.racePace} onAnswered={() => setRev(rev + 1)} />}
      {data?.ok && !data.racePace?.question && data.racePace && phase !== "sim" && <RacePaceNote view={data.racePace} />}
      {data?.ok && !data.racePace?.question && phase === "sim" && <BlockSim seed={data.seed} s={data.suggestion} onDone={() => setPhase("edit")} />}
      {data?.ok && !data.racePace?.question && phase === "edit" && <ReplanEditor res={data} options={options} startWith={startWith} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function ReplanEditor({ res, options, startWith, onClose, onSaved }: { res: Extract<RpRes, { ok: true }>; options: ReplanOptions; startWith: "plan" | "engine"; onClose: () => void; onSaved: () => void }) {
  const fmt = useFmt();
  const { seed, suggestion: s } = res;
  const engine = useMemo(() => s.weeks.map((w) => w.items), [s]);
  const planned = useMemo(() => workoutWeeks(res.replaces, seed.startWeek, seed.weeks), [res.replaces, seed]);
  const startRoles = useMemo(() => s.weeks.map((w) => w.role), [s]);
  const b = useBlockWeeks(seed, startWith === "plan" ? planned : engine, startRoles);
  // The engine's weeks are in (opened on them, or "Räkna om resten" pressed): its reasons and banner apply.
  const [recalced, setRecalced] = useState(startWith === "engine");
  const ev = useMemo(() => evaluateBlock(b.seed, b.weeks), [b.seed, b.weeks]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const edited = b.changed;
  // What the edited plan changes against the one it replaces, live as the weeks are edited.
  const diff = useMemo(() => diffPlans(seed, workoutWeeks(res.replaces, seed.startWeek, seed.weeks - res.extend), b.weeks), [seed, res.replaces, res.extend, b.weeks]);
  const newGoal = Math.round((res.done.km + ev.km) * 10) / 10;
  const adjusted = res.goal != null && newGoal < res.goal * (1 - BLOCK.goalSlack);
  const apply = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/blocks/${res.block.id}/replan`, { body: { weeks: b.weeks, roles: b.roles, replace: res.replaces.map((w) => w.id), extend: res.extend, thisWeek: !!options.thisWeek, pause: !!res.compressed, edit: startWith === "plan" } });
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const why = (i: number) => {
    if (!recalced) return "–";
    const w = s.weeks[i], e = ev.weeks[i];
    if (w.lighter) return t("rp.why.lighter");
    if (w.reentry) return t("rp.why.reentry", { dist: fmt.dist(seed.tolerance.peakKm, 0) });
    return t("rp.why.growth", { pct: pctText(e.growth), cap: growthPct });
  };
  const banner = res.compressed ? t(res.compressed.by === "race" ? "rp.bannerCompressedRace" : "rp.bannerCompressedBlock", { name: res.compressed.name })
    : res.extend > 0 ? tn("rp.bannerExtend", res.extend)
    : res.done.sick ? t("rp.bannerSick")
    : res.goal != null ? t("rp.banner", { done: fmt.dist(res.done.km), goal: fmt.dist(res.goal, 0) })
    : t("rp.bannerNoGoal", { done: fmt.dist(res.done.km) });
  const goalTile = (
    <div className="space-y-1 rounded-lg border border-card-edge bg-card shadow-card p-3">
      <div className="text-xs text-muted-foreground">{t("blk.stat.goal")}</div>
      <div className="text-xl font-semibold tabular-nums">{fmt.dist(newGoal, 0)}{res.goal != null && <span className="ml-1.5 text-sm font-normal text-muted-foreground">/ {fmt.dist(res.goal, 0)}</span>}</div>
      {res.goal != null && <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full bg-signature" style={{ width: `${Math.min(100, (res.done.km / Math.max(1, newGoal)) * 100)}%` }} /></div>}
      <div className="text-xs text-muted-foreground">{adjusted ? t("rp.goalAdjusted", { dist: fmt.dist(newGoal, 0) }) : res.goal != null ? t("rp.goalOk") : ""}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      {recalced
        ? <p className="rounded-lg bg-signature-soft px-4 py-3 text-sm text-signature-foreground">{banner}</p>
        : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
            <span className="min-w-0 flex-1 basis-80">
              {t("be.editHint", { done: fmt.dist(res.done.km) })}
              {res.race && <span className="mt-1 block text-xs">{t("be.editRace", { name: res.race.name, date: fmtDay(res.race.date, { day: "numeric", month: "short" }) })}</span>}
            </span>
            <Button variant="outline" onClick={() => { b.load(engine); setRecalced(true); }}>{t("rp.button")}</Button>
          </div>
        )}
      <TwoColumns ev={ev}
        weeks={<WeekEditor b={b} ev={ev} plan={s.weeks} canResize={false} canRetype fillAdded lockedBefore={res.today} doneKm={res.done.days}
          lockedDays={Object.fromEntries(res.raceDays.map((d) => [d, t("workout.race")]))} />}
        panel={<>
          {goalTile}
          <WhatIf diff={diff} />
          <BlockWarnings ev={ev} />
          <BlockCharts seed={b.seed} ev={ev} stacked />
        </>} />
      <div className="overflow-x-auto rounded-lg border border-card-edge bg-card shadow-card px-3">
        <table className="w-full min-w-[34rem] text-sm tabular-nums">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 font-normal">{t("rp.col.week")}</th><th className="py-2 font-normal">{t("rp.col.before")}</th>
            <th className="py-2 font-normal">{t("rp.col.now")}</th><th className="py-2 font-normal">{t("rp.col.changes")}</th>
            <th className="py-2 font-normal">{t("rp.col.why")}</th>
          </tr></thead>
          <tbody>
            {diff.weeks.map((w, i) => (
              <tr key={w.weekStart} className="border-t border-border align-top">
                <td className="py-2.5 font-semibold">{t("plan.weekShort", { week: weekNumber(w.weekStart) })}</td>
                <td className="py-2.5 text-muted-foreground">{w.kmBefore > 0 ? <span className="line-through">{fmt.dist(w.kmBefore)}</span> : "–"}</td>
                <td className="py-2.5 font-semibold">{fmt.dist(w.kmAfter)}</td>
                <td className="py-2.5 pr-2 text-xs text-muted-foreground">{w.changes.length ? w.changes.map((c) => <div key={c.date}>{changeText(c, fmt)}</div>) : "–"}</td>
                <td className="py-2.5 text-xs text-muted-foreground">{why(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Footer seed={b.seed} s={s} weeks={b.weeks} edited={edited} busy={busy} replaces={res.replaces.length}
        onClose={onClose} onReset={() => { b.reset(); setRecalced(startWith === "engine"); }} onApply={() => void apply()} applyLabel={t(recalced ? "rp.apply" : "be.save")} />
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

/** Form on race day, the number a taper is planned for, and whether it lands in the window the coach judges by. */
function RaceForm({ ev, name }: { ev: BlockEval; name: string }) {
  const r = ev.race!;
  const inside = r.form >= COACH.race.low && r.form <= COACH.race.high;
  return (
    <div className={cn("space-y-0.5 rounded-lg border p-3", inside ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10")}>
      <div className="text-xs text-muted-foreground">{t("be.race.form", { name })}</div>
      <div className={cn("text-xl font-semibold tabular-nums", inside ? "text-success" : "text-warning")}>{signed(r.form)}</div>
      <div className="text-xs text-muted-foreground">{t(inside ? "be.race.formOk" : r.form < COACH.race.low ? "be.race.formLow" : "be.race.formHigh", { low: signedInt(COACH.race.low), high: signedInt(COACH.race.high), date: fmtDay(r.date, { day: "numeric", month: "short" }) })}</div>
    </div>
  );
}

/** "Mon long run 16 → 14 km": one changed day as text. */
function changeText(c: DayChange, fmt: Fmt): string {
  const day = WEEKDAY_SHORT_LC(c.date);
  const km = (x: { type: string; km: number } | null) => (x ? `${t(`workout.${x.type}` as "workout.easy").toLowerCase()} ${fmt.dist(x.km)}` : "");
  if (c.kind === "added") return t("rp.change.added", { day, what: km(c.after) });
  if (c.kind === "removed") return t("rp.change.removed", { day, what: km(c.before) });
  return t("rp.change.changed", { day, from: km(c.before), to: km(c.after) });
}
const WEEKDAY_SHORT_LC = (d: ISODate) => WEEKDAY_LONG[weekday(d)].toLowerCase().slice(0, 3);

/** What the plan does to the block, before → after: km, the biggest week, the form in the deepest week, where it ends. */
function WhatIf({ diff }: { diff: PlanDiff }) {
  const fmt = useFmt();
  const { before, after } = diff;
  const wk = (ws: ISODate | undefined) => (ws ? t("plan.weekShort", { week: weekNumber(ws) }) : "–");
  const was = (v: string | null) => (v == null ? t("rp.if.nothing") : t("rp.if.was", { value: v }));
  return (
    <div className="grid grid-cols-2 gap-2" aria-label={t("rp.if.title")}>
      <Tile label={t("rp.if.km")} value={fmt.dist(after.km, 0)} sub={was(before ? fmt.dist(before.km, 0) : null)} />
      <Tile label={t("rp.if.peak")} value={after.peak ? fmt.dist(after.peak.km, 0) : "–"} sub={`${wk(after.peak?.weekStart)} · ${was(before?.peak ? `${fmt.dist(before.peak.km, 0)}, ${wk(before.peak.weekStart)}` : null)}`} />
      <Tile label={t("rp.if.form")} value={after.deepestForm == null ? "–" : signed(after.deepestForm)} sub={was(before?.deepestForm == null ? null : signed(before.deepestForm))} />
      <Tile label={t("rp.if.ends")} value={wk(after.endsOn)} sub={was(before ? wk(before.endsOn) : null)} />
    </div>
  );
}
