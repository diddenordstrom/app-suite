import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, useApi } from "../http";
import { useSettings } from "../prefs";
import { Button, Card, CardTitle, Dialog, ErrorText, IconButton, Input, SegmentedControl, Spinner } from "../ui";
import { fmtDay } from "../bits";
import { locale, t, tm, type MsgKey } from "../i18n";
import { clock, entryFor, matchesSearch, moveItem, exName, fmtKg, loadDraft, newClientId, patchSet, patternName, planText, queue, saveDraft, setsText, toInput, useOutbox, type Draft, type DraftEntry } from "../gymlog";
import { alternatives, customId, exercise, EXERCISES, known, TEMPLATE_IDS, TEMPLATES, type TemplateId } from "@/shared/gym";
import { startEntries, suggestSets, volume, workSetCount, type GymDay, type GymSessionInput, type Improvement, type LastTime } from "@/shared/gymplan";
import { todayIn } from "@/shared/dates";

/*
 * The gym session (docs/decisions/fartlek-gym-module.md): the session page asks "start?" with the template,
 * and the exercises (swap or add before starting); then one card per exercise with set
 * rows pre-filled from last time; then what beat last time. The session in progress is kept on the phone.
 */

interface Finished { input: GymSessionInput; improvements: Improvement[]; offline: boolean; last: Record<string, LastTime> }

/** A new session on a template: the runner's own version of it when there is one (unless `fresh`), else the suggestion. */
function build(day: GymDay, tpl: TemplateId, fresh = false): Draft {
  const { own, entries } = startEntries(tpl, day.layouts, fresh);
  return {
    clientId: newClientId(), date: day.date, template: tpl, feel: null, workoutId: day.planned?.id ?? null, startedAt: null, lastSetAt: null,
    ownFrom: own?.date ?? null,
    entries: entries.map((e) => entryFor(e.exercise, e.slot, e.scheme, day.last[e.exercise])),
  };
}

/** A why-message with the workout type in it translated. */
const whyText = (m: GymDay["suggested"]["why"]) => tm({ key: m.key, params: m.params?.type ? { ...m.params, type: t(`workout.${m.params.type}` as MsgKey) } : m.params });

export function Gym() {
  const [params] = useSearchParams();
  const { settings } = useSettings();
  const date = params.get("date") ?? todayIn(settings.timezone);
  const { data, error, reload } = useApi<GymDay>(`/gym?date=${date}`);
  const [draft, setDraftState] = useState<Draft | null>(() => {
    const d = loadDraft();
    // A session already started is picked up whatever day it is; one not started is for its day only.
    return d && (d.startedAt || d.date === date) ? d : null;
  });
  const [finished, setFinished] = useState<Finished | null>(null);
  useOutbox(reload);
  const setDraft = (d: Draft | null) => { saveDraft(d); setDraftState(d); };

  useEffect(() => {
    if (data && !draft && !finished) setDraft(build(data, data.suggested.id));
  }, [data, draft, finished]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (finished) return <Done f={finished} />;
  if (!data || !draft) return <div className="grid place-items-center py-16"><Spinner /></div>;
  return draft.startedAt
    ? <Active day={data} draft={draft} setDraft={setDraft} onFinished={(f) => { setDraft(null); setFinished(f); window.scrollTo(0, 0); }} />
    : <Setup day={data} draft={draft} setDraft={setDraft} rebuild={(tpl, fresh) => setDraft(build(data, tpl, fresh))} />;
}

function Setup({ day, draft, setDraft, rebuild }: { day: GymDay; draft: Draft; setDraft: (d: Draft | null) => void; rebuild: (tpl: TemplateId, fresh?: boolean) => void }) {
  const tpl = draft.template ?? "A";
  const own = day.layouts?.[tpl];
  const [swapAt, setSwapAt] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const minutes = TEMPLATES[tpl].minutes;
  const replace = (i: number, e: DraftEntry) => setDraft({ ...draft, entries: draft.entries.map((x, j) => (j === i ? e : x)) });
  // Reordering: drag a row by its handle (pointer events, so touch works too), or arrow keys on the handle.
  const listRef = useRef<HTMLUListElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => setDraft({ ...draft, entries: moveItem(draft.entries, from, to) });
  const startDrag = (ev: PointerEvent<HTMLButtonElement>, i: number) => { ev.currentTarget.setPointerCapture(ev.pointerId); setDragging(i); };
  const onDrag = (ev: PointerEvent<HTMLButtonElement>) => {
    if (dragging == null || !listRef.current) return;
    const rows = [...listRef.current.children] as HTMLElement[];
    let to = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
    if (to < 0) to = rows.length - 1;
    if (to > dragging) to = Math.max(dragging, to - 1);
    if (to !== dragging) { move(dragging, to); setDragging(to); }
  };
  const endDrag = () => setDragging(null);
  const onMoveKey = (ev: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = ev.key === "ArrowUp" ? i - 1 : ev.key === "ArrowDown" ? i + 1 : null;
    if (to == null || to < 0 || to >= draft.entries.length) return;
    ev.preventDefault();
    move(i, to);
    const btn = ev.currentTarget;
    requestAnimationFrame(() => btn.focus());
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">← {fmtDay(day.date, { weekday: "long", day: "numeric", month: "long" })}</Link>
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-medium">{t("gym.title")} · {t(`gym.template.${tpl}`)}</h1>
        <p className="text-sm text-muted-foreground">{t(`gym.templateAbout.${tpl}`)} · {t("gym.meta", { n: draft.entries.length, min: minutes })}</p>
      </div>
      <SegmentedControl aria-label={t("gym.chooseTemplate")} className="w-full [&>button]:px-1.5" value={tpl}
        options={TEMPLATE_IDS.map((v) => ({ value: v, label: t(`gym.templateShort.${v}`) }))}
        onChange={(v) => rebuild(v)} />
      {tpl === day.suggested.id && <p className="rounded-md bg-accent px-3 py-2.5 text-sm text-accent-foreground">{whyText(day.suggested.why)}</p>}
      {draft.ownFrom
        ? <p className="text-sm text-muted-foreground">{t("gym.own", { date: fmtDay(draft.ownFrom, { day: "numeric", month: "short" }) })} · <button type="button" className="underline" onClick={() => rebuild(tpl, true)}>{t("gym.reset")}</button></p>
        : own
          ? <p className="text-sm"><button type="button" className="text-muted-foreground underline" onClick={() => rebuild(tpl)}>{t("gym.useOwn")}</button></p>
          : !Object.keys(day.layouts ?? {}).length && <p className="text-sm text-muted-foreground">{t("gym.ownHint")}</p>}
      {day.logged.length > 0 && <p className="text-sm text-muted-foreground">{t("gym.loggedToday")} <Link to="/gym/history" className="underline">{t("gym.history")}</Link></p>}

      <Card className="p-0">
        <ul ref={listRef}>
          {draft.entries.map((e, i) => (
            <li key={e.uid ?? `${e.exercise}-${i}`} className={`flex items-center gap-1 border-b border-border py-1.5 pr-1 pl-1 ${dragging === i ? "relative z-10 bg-accent shadow-lg" : ""}`}>
              <button type="button" aria-label={t("gym.move", { name: exName(e.exercise) })} title={t("gym.moveHint")}
                className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground active:cursor-grabbing"
                onPointerDown={(ev) => startDrag(ev, i)} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(ev) => onMoveKey(ev, i)}>
                <GripIcon />
              </button>
              <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block">{exName(e.exercise)}</span>
                <span className="block text-xs text-muted-foreground">{patternName(e.exercise, e.slot)} · {planText(e)}</span>
              </span>
              <IconButton className="size-11" label={t("gym.swap")} onClick={() => setSwapAt(i)}><SwapIcon /></IconButton>
              <IconButton className="size-11" label={t("gym.remove")} onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })}><XIcon /></IconButton>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setAdding(true)} className="flex h-12 w-full items-center justify-center gap-1.5 text-sm font-semibold text-primary">+ {t("gym.add")}</button>
      </Card>

      <Button className="h-12 w-full text-base" disabled={!draft.entries.length} onClick={() => { setDraft({ ...draft, startedAt: Date.now() }); window.scrollTo(0, 0); }}>{t("gym.start")}</Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("gym.recent")}: {t("gym.recentCount", { done: day.recent.done, planned: Math.max(day.recent.planned, day.recent.done) })} · <Link to="/gym/history" className="underline">{t("gym.history")}</Link>
      </p>

      <SwapDialog day={day} draft={draft} at={swapAt} onClose={() => setSwapAt(null)} onPick={(i, e) => { replace(i, e); setSwapAt(null); }} />
      <PickDialog open={adding} title={t("gym.addTitle")} day={day} suggestions={TEMPLATES[tpl].extras} onClose={() => setAdding(false)}
        onPick={(id) => { setDraft({ ...draft, entries: [...draft.entries, entryFor(id, null, null, day.last[id])] }); setAdding(false); }} />
    </div>
  );
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** Keeps the screen on during a session, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (k: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    const get = () => { if (document.visibilityState === "visible") nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    get();
    document.addEventListener("visibilitychange", get);
    return () => { document.removeEventListener("visibilitychange", get); void lock?.release().catch(() => {}); };
  }, []);
}

function firstOpenIn(entries: DraftEntry[]) {
  for (let i = 0; i < entries.length; i++) { const j = entries[i].sets.findIndex((s) => !s.done); if (j >= 0) return { e: i, s: j }; }
  return null;
}

function Active({ day, draft, setDraft, onFinished }: { day: GymDay; draft: Draft; setDraft: (d: Draft | null) => void; onFinished: (f: Finished) => void }) {
  const now = useNow();
  useWakeLock();
  const [swapAt, setSwapAt] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState<{ e: number; s: number } | null>(() => firstOpenIn(draft.entries));
  const update = (i: number, f: (e: DraftEntry) => DraftEntry, extra: Partial<Draft> = {}) => setDraft({ ...draft, ...extra, entries: draft.entries.map((x, j) => (j === i ? f(x) : x)) });
  const doneCount = draft.entries.filter((e) => e.sets.length && e.sets.every((s) => s.done)).length;
  const current = Math.min(draft.entries.length, doneCount + 1);

  const tick = (i: number, j: number) => {
    const wasDone = draft.entries[i].sets[j].done;
    const entries = draft.entries.map((x, k) => (k === i ? { ...x, sets: x.sets.map((s, m) => (m === j ? { ...s, done: !s.done } : s)) } : x));
    setDraft({ ...draft, entries, lastSetAt: wasDone ? draft.lastSetAt : Date.now() });
    if (!wasDone) {
      // Move on to the next open set: later in this exercise, else the next exercise with one.
      let next: { e: number; s: number } | null = null;
      for (let a = i; a < entries.length && !next; a++) { const b = entries[a].sets.findIndex((s, m) => !s.done && (a > i || m > j)); if (b >= 0) next = { e: a, s: b }; }
      setFocus(next);
    }
  };

  const finish = async () => {
    const open = draft.entries.some((e) => e.sets.some((s) => !s.done));
    if (open && !window.confirm(t("gym.finishConfirm"))) return;
    const input = toInput(draft);
    if (!input.entries.length) { setDraft(null); return; }
    setSaving(true);
    try {
      const res = await api<{ improvements: Improvement[] }>("/gym/sessions", { body: input });
      onFinished({ input, improvements: res.improvements, offline: false, last: day.last });
    } catch {
      queue(input);
      onFinished({ input, improvements: [], offline: true, last: day.last });
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{draft.template ? t(`gym.template.${draft.template}`) : t("gym.free")}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {clock(now - (draft.startedAt ?? now))} · {t("gym.exerciseOf", { n: current, total: draft.entries.length })}
            {draft.lastSetAt && focus && <> · {t("gym.rest", { time: clock(now - draft.lastSetAt) })}</>}
          </div>
        </div>
        <Button variant="outline" className="h-10" disabled={saving} onClick={() => void finish()}>{t("gym.finish")}</Button>
      </div>

      {draft.entries.map((e, i) => (
        <ExerciseCard key={e.uid ?? `${e.exercise}-${i}`} entry={e} last={day.last[e.exercise]} focus={focus?.e === i ? focus.s : null}
          onFocus={(s) => setFocus({ e: i, s })} onTick={(s) => tick(i, s)} onSwap={() => setSwapAt(i)}
          onChange={(s, patch) => update(i, (x) => ({ ...x, sets: patchSet(x.sets, s, patch) }))}
          onNote={(note) => update(i, (x) => ({ ...x, note }))}
          onRemoveSet={(s) => {
            const entries = draft.entries.map((x, k) => (k === i ? { ...x, sets: x.sets.filter((_, m) => m !== s) } : x));
            setDraft({ ...draft, entries });
            setFocus(firstOpenIn(entries));
          }}
          onAddSet={() => { update(i, (x) => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { kind: "work", kg: null, reps: x.scheme.low, seconds: null }), done: false }] })); setFocus({ e: i, s: e.sets.length }); }} />
      ))}

      <Button variant="outline" className="h-11 w-full" onClick={() => setAdding(true)}>+ {t("gym.add")}</Button>
      <button type="button" className="w-full py-2 text-sm text-muted-foreground underline" onClick={() => { if (window.confirm(t("gym.discardConfirm"))) setDraft(null); }}>{t("gym.discard")}</button>

      <SwapDialog day={day} draft={draft} at={swapAt} onClose={() => setSwapAt(null)} onPick={(i, ne) => { update(i, () => ne); setSwapAt(null); setFocus({ e: i, s: 0 }); }} />
      <PickDialog open={adding} title={t("gym.addTitle")} day={day} suggestions={draft.template ? TEMPLATES[draft.template].extras : []} onClose={() => setAdding(false)}
        onPick={(id) => { setDraft({ ...draft, entries: [...draft.entries, entryFor(id, null, null, day.last[id])] }); setFocus({ e: draft.entries.length, s: 0 }); setAdding(false); }} />
    </div>
  );
}

export function ExerciseCard({ entry, last, focus, onFocus, onTick, onChange, onSwap, onAddSet, onRemoveSet, onNote }: {
  entry: DraftEntry; last: LastTime | undefined; focus: number | null;
  onFocus: (s: number) => void; onTick: (s: number) => void; onChange: (s: number, patch: Partial<DraftEntry["sets"][number]>) => void; onSwap: () => void; onAddSet: () => void; onRemoveSet?: (s: number) => void; onNote?: (note: string) => void;
}) {
  const ex = exercise(entry.exercise);
  const sug = useMemo(() => suggestSets(entry.exercise, entry.scheme, last), [entry.exercise, entry.scheme, last]);
  const lastSets = last?.sets ?? [];
  const allDone = entry.sets.length > 0 && entry.sets.every((s) => s.done);
  const upText = sug.change !== "up" ? null : ex.load === "time" ? t("gym.upSeconds") : sug.sets[0].kg && last?.sets.some((s) => s.kg) ? t("gym.up", { kg: fmtKg(ex.step) }) : t("gym.upReps");
  const amountOf = (s: DraftEntry["sets"][number]) => ex.load === "time" ? `${s.seconds ?? "–"} ${t("gym.sec")}` : s.kg ? `${fmtKg(s.kg)} ${t("gym.kg")} × ${s.reps ?? "–"}` : `${s.reps ?? "–"} ${t("gym.reps")}`;
  const lastOf = (j: number) => {
    const l = lastSets[Math.min(j, lastSets.length - 1)];
    if (!l) return "–";
    return ex.load === "time" ? `${l.seconds ?? "–"} s` : l.kg ? `${fmtKg(l.kg)} × ${l.reps ?? "–"}` : `${l.reps ?? "–"}`;
  };

  return (
    <Card className={`space-y-3 ${allDone ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{patternName(entry.exercise, entry.slot)}</div>
          <h2 className="font-display text-2xl font-medium">{exName(entry.exercise)}</h2>
        </div>
        <Button variant="outline" className="h-9 shrink-0" onClick={onSwap}><SwapIcon /> {t("gym.swap")}</Button>
      </div>
      <p className="rounded-md bg-signature-soft px-3 py-1.5 text-sm text-signature-foreground">
        {last ? <>{t("gym.lastTime", { date: fmtDay(last.date, { day: "numeric", month: "short" }), sets: setsText(last.sets) })}{upText && <> · {upText}</>}</> : t("gym.never")}
      </p>
      {onNote && <input aria-label={t("gym.note")} placeholder={t("gym.notePlaceholder")} value={entry.note ?? ""} maxLength={300} onChange={(e) => onNote(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" />}
      <ol className="space-y-1.5">
        {entry.sets.map((s, j) => focus === j && !s.done ? (
          <li key={j} className="space-y-2 rounded-md bg-accent p-2.5 text-accent-foreground">
            <div className="flex items-center justify-between text-sm"><span className="font-semibold">{t("gym.set")} {j + 1}</span>
              <span className="flex items-center gap-1">{t("gym.last")} {lastOf(j)}
                {onRemoveSet && <button type="button" aria-label={t("gym.removeSet", { n: j + 1 })} onClick={() => onRemoveSet(j)} className="-my-2 -mr-1.5 grid size-9 place-items-center rounded-md"><XIcon /></button>}
              </span></div>
            <div className="flex items-center gap-2">
              {ex.load === "time" ? (
                <Stepper what={t("gym.sec")} value={s.seconds} step={5} onChange={(v) => onChange(j, { seconds: v })} className="flex-1" />
              ) : (
                <>
                  <Stepper what={t("gym.kg")} value={s.kg} step={ex.step || 2.5} decimals onChange={(v) => onChange(j, { kg: v })} className="flex-1" />
                  <Stepper what={t("gym.reps")} value={s.reps} step={1} onChange={(v) => onChange(j, { reps: v })} className="flex-1" />
                </>
              )}
            </div>
            <button type="button" onClick={() => onTick(j)} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground"><CheckIcon /> {t("gym.doneSet")}</button>
          </li>
        ) : (
          <SwipeRow key={j} label={t("gym.remove")} onDelete={onRemoveSet && (() => onRemoveSet(j))}>
            <div className="flex items-center gap-2 px-1">
              <button type="button" onClick={() => onFocus(j)} className="flex min-h-10 flex-1 items-center gap-3 text-left">
                <span className="w-5 shrink-0 text-sm font-semibold tabular-nums">{j + 1}</span>
                <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{lastOf(j)}</span>
                <span className={`whitespace-nowrap tabular-nums ${s.done ? "font-semibold" : "text-muted-foreground"}`}>{amountOf(s)}</span>
              </button>
              {/* On a touch screen the row is swiped away instead. */}
              {onRemoveSet && <button type="button" aria-label={t("gym.removeSet", { n: j + 1 })} onClick={() => onRemoveSet(j)} className="grid size-8 place-items-center rounded-md text-muted-foreground pointer-coarse:hidden"><XIcon /></button>}
              {s.done
                ? <button type="button" aria-label={t("gym.undoSet")} onClick={() => onTick(j)} className="grid size-10 place-items-center rounded-md bg-success text-background"><CheckIcon /></button>
                : <button type="button" aria-label={t("gym.doneSet")} onClick={() => onTick(j)} className="size-10 rounded-md border border-dashed border-border" />}
            </div>
          </SwipeRow>
        ))}
      </ol>
      <button type="button" onClick={onAddSet} className="text-sm font-semibold text-primary">{t("gym.addSet")}</button>
    </Card>
  );
}

const SWIPE_OPEN = 88;

/** A row that a finger drags left to show a delete button behind it (touch only; a mouse uses the row's own button). */
function SwipeRow({ label, onDelete, children }: { label: string; onDelete?: () => void; children: ReactNode }) {
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const from = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  if (!onDelete) return <li>{children}</li>;
  const open = x <= -SWIPE_OPEN / 2;
  const onDown = (ev: PointerEvent<HTMLDivElement>) => {
    if (ev.pointerType === "mouse") return;
    from.current = { x: ev.clientX, y: ev.clientY, base: x, horizontal: null };
    moved.current = false;
  };
  const onMove = (ev: PointerEvent<HTMLDivElement>) => {
    const f = from.current;
    if (!f) return;
    const dx = ev.clientX - f.x, dy = ev.clientY - f.y;
    if (f.horizontal == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      f.horizontal = Math.abs(dx) > Math.abs(dy);
      if (f.horizontal) { ev.currentTarget.setPointerCapture(ev.pointerId); setDrag(true); }
    }
    if (f.horizontal) { moved.current = true; setX(Math.min(0, Math.max(-SWIPE_OPEN - 24, f.base + dx))); }
  };
  const onUp = () => {
    if (from.current?.horizontal) setX((v) => (v <= -SWIPE_OPEN / 2 ? -SWIPE_OPEN : 0));
    setDrag(false);
    from.current = null;
  };
  return (
    <li className="relative overflow-hidden rounded-md">
      <button type="button" aria-hidden={!open} tabIndex={open ? 0 : -1} onClick={() => { setX(0); onDelete(); }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-danger font-semibold text-background" style={{ width: SWIPE_OPEN }}>{label}</button>
      <div className="relative touch-pan-y bg-card" style={{ transform: `translateX(${x}px)`, transition: drag ? "none" : "transform 150ms ease-out" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        // A tap on an open row closes it instead of acting; a drag never counts as a tap.
        onClickCapture={(ev) => { if (moved.current || x !== 0) { ev.stopPropagation(); ev.preventDefault(); moved.current = false; if (x !== 0) setX(0); } }}>
        {children}
      </div>
    </li>
  );
}

function Stepper({ what, value, step, decimals, onChange, className }: { what: string; value: number | null; step: number; decimals?: boolean; onChange: (v: number | null) => void; className?: string }) {
  const [text, setText] = useState(value == null ? "" : fmtKg(value));
  useEffect(() => { setText(value == null ? "" : fmtKg(value)); }, [value]);
  const set = (n: number | null) => onChange(n == null ? null : Math.max(0, Math.round(n * 100) / 100));
  return (
    <div className={`flex h-12 items-center rounded-md border border-border bg-card text-foreground ${className ?? ""}`}>
      <button type="button" aria-label={t("gym.minus", { what })} onClick={() => set((value ?? 0) - step)} className="h-full w-9 shrink-0 text-xl">−</button>
      <input aria-label={what} inputMode={decimals ? "decimal" : "numeric"} value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { const n = Number(text.replace(",", ".")); set(text.trim() === "" || !Number.isFinite(n) ? null : n); }}
        className="h-full w-full min-w-0 bg-transparent text-center text-lg font-semibold tabular-nums outline-none" />
      <button type="button" aria-label={t("gym.plus", { what })} onClick={() => set((value ?? 0) + step)} className="h-full w-9 shrink-0 text-xl">+</button>
    </div>
  );
}

function SwapDialog({ day, draft, at, onClose, onPick }: { day: GymDay; draft: Draft; at: number | null; onClose: () => void; onPick: (i: number, e: DraftEntry) => void }) {
  const e = at == null ? null : draft.entries[at];
  const ranked = e && draft.template ? TEMPLATES[draft.template].slots.find((s) => s.pattern === e.slot)?.choices ?? [] : [];
  const options = e ? alternatives(e.exercise, ranked) : [];
  return (
    <PickDialog open={e != null} title={t("gym.swapTitle")} intro={t("gym.swapBody")} day={day} suggestions={options} onClose={onClose}
      onPick={(id) => {
        if (!e || at == null) return;
        const sameLoad = exercise(id).load === exercise(e.exercise).load;
        // A swap within the slot keeps it; one found by search outside it takes its own pattern.
        const slot = known(id) && exercise(id).pattern !== e.slot ? exercise(id).pattern : e.slot;
        onPick(at, { ...entryFor(id, slot, sameLoad && slot === e.slot ? e.scheme : null, day.last[id]), uid: e.uid });
      }} />
  );
}

/** A list of exercises to pick from: suggestions first, a search over the catalogue and the runner's own, or a new name. */
function PickDialog({ open, title, intro, day, suggestions, onClose, onPick }: { open: boolean; title: string; intro?: string; day: GymDay; suggestions: string[]; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const own = Object.keys(day.last).filter((id) => id.startsWith("x:"));
  const all = [...EXERCISES.map((e) => e.id), ...own];
  const query = q.trim().toLocaleLowerCase();
  const list = query ? all.filter((id) => matchesSearch(id, q)).slice(0, 30) : suggestions;
  // Offer the typed name as a new exercise only when nothing matches it.
  const exact = list.length > 0;
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {intro && <p className="mb-3 text-sm text-muted-foreground">{intro}</p>}
      <Input aria-label={t("gym.search")} placeholder={t("gym.search")} value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      <ul className="space-y-2">
        {list.map((id) => {
          const l = day.last[id];
          return (
            <li key={id}>
              <button type="button" onClick={() => onPick(id)} className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{exName(id)}</span>
                  <span className="block text-xs text-muted-foreground">{patternName(id, null)} · {l ? `${t("gym.last")} ${fmtDay(l.date, { day: "numeric", month: "short" })}: ${setsText(l.sets)}` : t("gym.never")}</span>
                </span>
                <span aria-hidden className="text-muted-foreground">›</span>
              </button>
            </li>
          );
        })}
        {query && !exact && (
          <li><Button variant="outline" className="w-full" onClick={() => onPick(customId(q))}>{t("gym.addCustom", { name: q.trim() })}</Button></li>
        )}
      </ul>
    </Dialog>
  );
}

function Done({ f }: { f: Finished }) {
  const navigate = useNavigate();
  const minutes = f.input.startedAt && f.input.finishedAt ? Math.round((f.input.finishedAt - f.input.startedAt) / 60000) : null;
  const tons = volume(f.input.entries) / 1000;
  const first = !f.input.entries.some((e) => f.last[e.exercise]);
  const delta = (i: Improvement) => i.kg > 0 ? `+${fmtKg(i.kg)} ${t("gym.kg")}` : i.reps > 0 ? `+${i.reps} ${t("gym.reps")}` : `+${i.seconds} ${t("gym.sec")}`;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-4xl leading-tight font-medium">{t("gym.doneTitle")}</h1>
      <div className="grid grid-cols-3 gap-2">
        {[[t("gym.time"), minutes != null ? `${minutes} min` : "–"], [t("gym.sets"), String(workSetCount(f.input.entries))], [t("gym.volume"), t("gym.volumeTons", { t: tons.toLocaleString(locale, { maximumFractionDigits: 1 }) })]].map(([k, v]) => (
          <Card key={k} className="space-y-0.5 p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="font-display text-2xl font-medium tabular-nums">{v}</div>
          </Card>
        ))}
      </div>
      {f.offline && <p className="rounded-md bg-signature-soft px-3 py-2.5 text-sm text-signature-foreground">{t("gym.savedLater")}</p>}
      {!f.offline && (
        <Card className="space-y-2">
          <CardTitle>{t("gym.better")}</CardTitle>
          {f.improvements.length ? (
            <ul className="space-y-1.5">
              {f.improvements.map((i) => (
                <li key={i.exercise} className="flex items-baseline justify-between gap-2">
                  <span>{exName(i.exercise)}</span>
                  <span className="tabular-nums"><strong>{setsText([i.best])}</strong> <span className="text-sm font-semibold text-success">{delta(i)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{first ? t("gym.firstTime") : t("gym.noBetter")}</p>}
        </Card>
      )}
      <div className="flex gap-2">
        <Button className="h-12 flex-1" onClick={() => navigate("/")}>{t("gym.done")}</Button>
        <Link to="/gym/history" className="inline-flex h-12 items-center rounded-md border border-border px-4 text-sm">{t("gym.history")}</Link>
      </div>
    </div>
  );
}

const SwapIcon = () => <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>;
const GripIcon = () => <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>;
const XIcon = () => <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>;
const CheckIcon = () => <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5 9-10" /></svg>;
