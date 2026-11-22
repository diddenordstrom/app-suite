/**
 * A place on the day: the compact card in the timeline (read mode) and the panel it opens into (live editing:
 * every field saves itself, there is no Save button). Vias are a light one-line row with a small panel of their own.
 * Ideas in the idea bank use the same panel.
 */
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { PlanResponse, StopBody } from "@/shared/api";
import { formatLatLon, hasCoords } from "@/shared/geo";
import { discoverLinks, linkSource, placeSearchUrl } from "@/shared/links";
import { closedMonth, type Stop, type StopLink, type Todo } from "@/shared/plan";
import { parseTodo } from "@/shared/quick";
import { errorMessage, invalidateScopes } from "../api";
import { useAction } from "../hooks";
import { queueCheck, usePendingChecks } from "../checkQueue";
import { useTrip } from "../trip";
import { Button, cn, ErrorText, IconButton, Input, Select } from "../ui";
import { AutoInput, CategoryTag, Eyebrow, readPosition, Sign } from "./bits";
import { uploadPhoto } from "./Cover";
import { CheckIcon } from "./icons";
import { monthName, t, tn } from "../i18n";

const PREVIEW_TODOS = 3;

/** Save a stop field and show "Saved" for a moment. */
function useStopSave(stopId: number) {
  const { call } = useTrip();
  const { run, busy, error, setError } = useAction();
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = (body: StopBody) => void run(async () => {
    await call("PATCH", `/stops/${stopId}`, body, ["plan"]);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1800);
  });
  return { save, busy, error, setError, saved, run, call };
}

function Saved({ on }: { on: boolean }) {
  return (
    <span aria-live="polite" className={cn("inline-flex items-center gap-1 text-xs text-success transition-opacity", on ? "opacity-100" : "opacity-0")}>
      <CheckIcon className="size-3.5" />{t("stop.saved")}
    </span>
  );
}

// ---- read mode ----

/** The stop as a card in the day's timeline: number, photo, name, progress and the first few todos (tickable). */
export function StopCard({ stop, no, date, highlight, onOpen }: { stop: Stop; no: number; date: Date | null; highlight: boolean; onOpen: () => void }) {
  const done = stop.todos.filter((x) => x.done).length;
  const closed = closedMonth(stop, date);
  const meta = [
    stop.todos.length ? t("day.doneCount", { done, total: stop.todos.length }) : "",
    stop.links.length ? tn("stop.linksCount", stop.links.length) : "",
  ].filter(Boolean).join(" · ");
  const rest = stop.todos.length - PREVIEW_TODOS;
  return (
    <div id={`stop-${stop.id}`} className={cn("min-w-0 flex-1 rounded-lg border border-border bg-card", highlight && "ring-2 ring-primary")}>
      <button type="button" onClick={onOpen} aria-label={t("stop.open", { name: stop.name })} className="flex w-full items-center gap-3 p-3 text-left">
        {stop.photoUrl && <img src={stop.photoUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-md object-cover" />}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-bold leading-tight">{stop.name}</span>
          {meta && <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>}
          {closed && <span className="mt-0.5 block text-xs font-semibold text-warning">{t("stop.closed", { month: monthName(closed) })}</span>}
        </span>
        <span aria-hidden className="text-muted-foreground">›</span>
      </button>
      {stop.todos.length > 0 && (
        <ul className="-mt-1 px-3 pb-2">
          {stop.todos.slice(0, PREVIEW_TODOS).map((x) => <TodoCheck key={x.id} todo={x} />)}
          {rest > 0 && <li className="py-1 text-xs text-muted-foreground">{tn("stop.moreTodos", rest)}</li>}
        </ul>
      )}
      <span className="sr-only">{t("stop.sign", { n: no })}</span>
    </div>
  );
}

/** A tickable todo; ticks queue offline (checkQueue). */
function TodoCheck({ todo, children }: { todo: Todo; children?: ReactNode }) {
  const { tid } = useTrip();
  const pending = usePendingChecks(tid);
  const done = pending.done("todo", todo.id, todo.done);
  return (
    <li className="flex min-h-9 items-center gap-2.5">
      <input
        type="checkbox" className="size-5 shrink-0 accent-[var(--primary)] pointer-coarse:size-6" checked={done}
        aria-label={t("stop.done", { text: todo.text })} onChange={(e) => queueCheck(tid, { kind: "todo", id: todo.id, done: e.target.checked })}
      />
      <span className={cn("min-w-0 flex-1 break-words text-sm", done && "text-muted-foreground line-through")}>{todo.text}</span>
      {children}
    </li>
  );
}

/** A via: one light line in the timeline. Tapping it opens a small panel. */
export function ViaRow({ stop, onOpen }: { stop: Stop; onOpen: () => void }) {
  return (
    <button type="button" id={`stop-${stop.id}`} onClick={onOpen} aria-label={t("via.edit", { name: stop.name })} className="min-h-9 text-left text-sm text-muted-foreground">
      {t("via.label")} <span className="font-medium text-foreground">{stop.name}</span>
    </button>
  );
}

// ---- edit mode ----

/** The opened stop, idea or via. Fields save on blur; actions apply at once. */
export function StopPanel({ plan, stop, no, dayIndex, onClose }: {
  plan: PlanResponse; stop: Stop; no: number | null; dayIndex: number | null; onClose: () => void;
}) {
  const { save, busy, error, setError, saved, run, call } = useStopSave(stop.id);
  const via = stop.kind === "via";
  const days = plan.days;
  const dayStops = dayIndex === null ? [] : days[dayIndex].stops;
  const si = dayStops.findIndex((s) => s.id === stop.id);
  const move = (dir: -1 | 1) => void run(() => call("POST", `/stops/${stop.id}/move`, { dir }, ["plan"]));
  const remove = () => {
    if (confirm(t("stop.confirmDelete", { name: stop.name }))) void run(async () => { await call("DELETE", `/stops/${stop.id}`, undefined, ["plan"]); onClose(); });
  };
  const toDay = (dayId: number | null) => void run(async () => { await call("PATCH", `/stops/${stop.id}`, { dayId }, ["plan"]); onClose(); });
  const firstOnTrip = dayIndex === 0 && si === 0, lastOnTrip = dayIndex === days.length - 1 && si === dayStops.length - 1;

  return (
    <section id={`stop-${stop.id}`} aria-label={stop.name} className="min-w-0 flex-1 space-y-3.5 rounded-lg border border-primary bg-card p-3.5">
      <div className="flex items-center gap-2.5">
        {no !== null && <Sign label={t("stop.sign", { n: no })}>{no}</Sign>}
        <AutoInput
          value={stop.name} aria-label={t("stop.name")} required
          onSave={(v) => (v ? save({ name: v }) : setError(t("stop.name")))}
          className="h-10 min-w-0 flex-1 border-0 border-b border-dashed bg-transparent px-0 text-lg font-bold shadow-none"
        />
        <Saved on={saved} />
        <Button variant="ghost" className="h-9 shrink-0 px-2.5" onClick={onClose}>{t("stop.collapse")}</Button>
      </div>

      <PositionField stop={stop} area={plan.area} onSave={(p) => save(p)} onInvalid={() => setError(t("pos.invalid"))} />

      {!via && <PhotoBlock stop={stop} />}

      {!via && (
        <div>
          <Eyebrow>{t("stop.onSite")}</Eyebrow>
          <ul className="mt-1 divide-y divide-border">
            {stop.todos.map((x) => (
              <TodoCheck key={x.id} todo={x}>
                <CategoryTag category={x.category} />
                <IconButton label={t("stop.removeTodo", { text: x.text })} onClick={() => void run(() => call("DELETE", `/todos/${x.id}`, undefined, ["plan"]))}>×</IconButton>
              </TodoCheck>
            ))}
          </ul>
          <NewTodo stopId={stop.id} />
        </div>
      )}

      {!via && <Discover stop={stop} area={plan.area} />}

      {!via && <Links stop={stop} />}

      {!via && (
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("stop.note")}</span>
          <AutoInput value={stop.note} onSave={(v) => save({ note: v })} />
        </label>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {dayIndex !== null && (
          <>
            <IconButton label={t("stop.moveUp")} disabled={firstOnTrip || busy} onClick={() => move(-1)}>↑</IconButton>
            <IconButton label={t("stop.moveDown")} disabled={lastOnTrip || busy} onClick={() => move(1)}>↓</IconButton>
          </>
        )}
        <Select
          aria-label={t("stop.moveToDay")} value="" className="h-9 w-auto min-w-0 max-w-full flex-1"
          onChange={(e) => { if (e.target.value) toDay(e.target.value === "ideas" ? null : Number(e.target.value)); }}
        >
          <option value="">{dayIndex === null ? t("ideas.otherDay") : t("stop.moveToDay")}</option>
          {days.map((d, i) => (i === dayIndex ? null : <option key={d.id} value={d.id}>{t("day.n", { n: i + 1 })}{d.title ? ` · ${d.title}` : ""}</option>))}
          {dayIndex !== null && <option value="ideas">{t("stop.toIdeas")}</option>}
        </Select>
        <Button variant="outline" className="h-9" disabled={busy} onClick={() => save({ kind: via ? "stop" : "via" })}>
          {via ? t("stop.makeStop") : t("stop.makeVia")}
        </Button>
        <Button variant="ghost" className="ml-auto h-9 text-danger" disabled={busy} onClick={remove}>{t("stop.delete")}</Button>
      </div>
    </section>
  );
}

function PositionField({ stop, area, onSave, onInvalid }: { stop: Stop; area: string; onSave: (p: { lat: number | null; lon: number | null }) => void; onInvalid: () => void }) {
  return (
    <div className="space-y-1">
      <AutoInput
        value={formatLatLon(stop)} inputMode="decimal" placeholder={t("day.positionPlaceholder")} aria-label={t("stop.positionLabel")} className="h-9 text-sm"
        onSave={(v) => { const p = readPosition(v); if (p === "invalid") onInvalid(); else onSave(p); }}
      />
      <p className="text-xs text-muted-foreground">
        {hasCoords(stop) ? null : <>{t("stop.nameOnly")} </>}
        <a className="text-primary underline" href={placeSearchUrl(hasCoords(stop) ? `${stop.lat},${stop.lon}` : stop.name, hasCoords(stop) ? "" : area)} target="_blank" rel="noopener noreferrer">
          {hasCoords(stop) ? t("stop.showOnMap") : t("stop.search")}
        </a>
      </p>
    </div>
  );
}

function PhotoBlock({ stop }: { stop: Stop }) {
  const { base, call, tid } = useTrip();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      await uploadPhoto(base, `/stops/${stop.id}/photo`, file);
      invalidateScopes(tid, ["plan"]);
    } catch (err) {
      setError(t("cover.failed", { reason: errorMessage(err) }));
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError(null);
    try { await call("DELETE", `/stops/${stop.id}/photo`, undefined, ["plan"]); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const btn = "inline-flex h-8 items-center rounded-full border border-border bg-card/90 px-3 text-xs font-medium text-foreground hover:border-primary";
  return (
    <div>
      {stop.photoUrl ? (
        <div className="relative overflow-hidden rounded-md">
          <img src={stop.photoUrl} alt={t("stop.photo", { name: stop.name })} className="block max-h-56 w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button type="button" className={btn} disabled={busy} onClick={() => input.current?.click()}>{t("cover.replace")}</button>
            <button type="button" className={btn} disabled={busy} onClick={() => void remove()}>{t("cover.remove")}</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="h-10 w-full rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary">
          {busy ? t("cover.uploading") : t("cover.add")}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** One line adds a todo; "fika Bakeriet" picks the category like quick entry. */
function NewTodo({ stopId }: { stopId: number }) {
  const { call } = useTrip();
  const [text, setText] = useState("");
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const td = parseTodo(text.trim());
    void run(async () => { await call("POST", `/stops/${stopId}/todos`, { text: td.text, category: td.category }, ["plan"]); setText(""); });
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2.5">
      <span aria-hidden className="w-5 text-center text-lg text-muted-foreground">+</span>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("stop.newTodo")} aria-label={t("stop.todoLabel")} disabled={busy} className="h-9 border-0 bg-transparent px-0 shadow-none" />
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

const DISCOVER_SOURCE: Partial<Record<string, string>> = { hikes: "ut.no", birds: "eBird", tent: "Park4night" };

function Discover({ stop, area }: { stop: Stop; area: string }) {
  const links = discoverLinks(stop, area);
  return (
    <div className="space-y-2">
      <Eyebrow>{t("stop.discover")}</Eyebrow>
      <div className="grid grid-cols-2 gap-2">
        {links.map((l) => (
          <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border px-3 text-sm font-medium hover:border-primary">
            {t(`disc.${l.key}`)}
            {DISCOVER_SOURCE[l.key] && <span className="text-[11px] text-muted-foreground">{DISCOVER_SOURCE[l.key]}</span>}
          </a>
        ))}
      </div>
      {!hasCoords(stop) && <p className="text-xs text-muted-foreground">{t("stop.discoverNoPos")}</p>}
    </div>
  );
}

function Links({ stop }: { stop: Stop }) {
  const { call } = useTrip();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    void run(async () => { await call("POST", `/stops/${stop.id}/links`, { url: url.trim(), note: note.trim() }, ["plan"]); setUrl(""); setNote(""); });
  };
  return (
    <div className="space-y-2">
      <Eyebrow>{t("stop.inspiration")}</Eyebrow>
      {stop.links.map((l) => <LinkRow key={l.id} link={l} />)}
      <form onSubmit={add} className="space-y-2">
        <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("stop.pasteLink")} aria-label={t("stop.pasteLink")} className="h-10 border-dashed" />
        {url.trim() && (
          <div className="flex gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("stop.linkNote")} aria-label={t("stop.linkNote")} className="h-10" />
            <Button type="submit" disabled={busy} className="h-10 shrink-0">{t("add.submit")}</Button>
          </div>
        )}
      </form>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function LinkRow({ link }: { link: StopLink }) {
  const { call } = useTrip();
  const { run } = useAction();
  const src = linkSource(link.url);
  const host = (() => { try { return new URL(link.url).hostname.replace(/^www\./, ""); } catch { return link.url; } })();
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted p-2">
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 flex-col px-1">
        <span className="truncate text-sm font-semibold">{t(`src.${src}`)}{src === "web" ? ` · ${host}` : ""}</span>
        {link.note && <span className="truncate text-xs text-muted-foreground">{link.note}</span>}
      </a>
      <IconButton label={t("stop.removeLink")} onClick={() => void run(() => call("DELETE", `/links/${link.id}`, undefined, ["plan"]))}>×</IconButton>
    </div>
  );
}

/** Ideas list entry: photo, name, first link and quick "put on a day". */
export function IdeaCard({ plan, idea, targetDay, onOpen }: { plan: PlanResponse; idea: Stop; targetDay: number; onOpen: () => void }) {
  const { call } = useTrip();
  const { run, busy, error } = useAction();
  const toDay = (dayId: number) => void run(() => call("PATCH", `/stops/${idea.id}`, { dayId }, ["plan"]));
  const first = idea.links[0];
  return (
    <li className="space-y-2.5 rounded-lg border border-border bg-card p-3">
      <button type="button" onClick={onOpen} aria-label={t("stop.open", { name: idea.name })} className="flex w-full items-center gap-3 text-left">
        {idea.photoUrl && <img src={idea.photoUrl} alt="" loading="lazy" className="size-14 shrink-0 rounded-md object-cover" />}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-bold leading-tight">{idea.name}</span>
          {idea.note && <span className="mt-0.5 block text-xs text-muted-foreground">{idea.note}</span>}
          {first && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t(`src.${linkSource(first.url)}`)}{first.note ? ` · ${first.note}` : ""}</span>}
        </span>
        <span aria-hidden className="text-muted-foreground">›</span>
      </button>
      <div className="flex gap-2">
        <Button className="h-9 shrink-0" disabled={busy} onClick={() => toDay(plan.days[targetDay].id)}>{t("ideas.toDay", { n: targetDay + 1 })}</Button>
        <Select aria-label={t("ideas.otherDay")} value="" className="h-9 min-w-0 flex-1" onChange={(e) => { if (e.target.value) toDay(Number(e.target.value)); }}>
          <option value="">{t("ideas.otherDay")}</option>
          {plan.days.map((d, i) => <option key={d.id} value={d.id}>{t("day.n", { n: i + 1 })}{d.title ? ` · ${d.title}` : ""}</option>)}
        </Select>
      </div>
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

