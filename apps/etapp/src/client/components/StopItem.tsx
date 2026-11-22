import { useState, type FormEvent } from "react";
import type { StopBody } from "@/shared/api";
import { formatLatLon, hasCoords, parseLatLon } from "@/shared/geo";
import { NEARBY, nearbyUrl, placeSearchUrl } from "@/shared/links";
import { CATEGORIES, closedMonth, type Category, type Stop, type Todo } from "@/shared/plan";
import { useAction } from "../hooks";
import { queueCheck, usePendingChecks } from "../checkQueue";
import { useTrip } from "../trip";
import { Button, cn, ErrorText, Field, IconButton, Input, Select, Textarea } from "../ui";
import { CategoryTag, ChipButton, ChipLink, Chips, Eyebrow, Sign } from "./bits";
import { monthName, t } from "../i18n";

/** "61.8, 8.5" → position, "" → none, anything else → error. */
export function readPosition(text: string): { lat: number | null; lon: number | null } | "invalid" {
  if (!text.trim()) return { lat: null, lon: null };
  return parseLatLon(text) ?? "invalid";
}

export function StopItem({ stop, no, area, date, first, last, highlight }: {
  stop: Stop; no: number; area: string; date: Date | null; first: boolean; last: boolean; highlight: boolean;
}) {
  const { call } = useTrip();
  const [editing, setEditing] = useState(false);
  const [near, setNear] = useState(false);
  const { run, busy, error } = useAction();
  const move = (dir: -1 | 1) => void run(() => call("POST", `/stops/${stop.id}/move`, { dir }, ["plan"]));

  if (editing) return <StopEdit stop={stop} onDone={() => setEditing(false)} />;

  const closed = closedMonth(stop, date);
  const done = stop.todos.filter((x) => x.done).length;
  return (
    <div id={`stop-${stop.id}`} className={cn("space-y-2.5 rounded-lg border border-border bg-background p-3", highlight && "ring-2 ring-primary")}>
      <div className="flex items-start gap-3">
        <Sign label={t("stop.sign", { n: no })}>{no}</Sign>
        <div className="min-w-0 flex-1">
          <h4 className="break-words text-base font-semibold leading-tight">{stop.name}</h4>
          {stop.note && <p className="mt-1 break-words text-sm text-muted-foreground">{stop.note}</p>}
          {closed && <p className="mt-1 text-sm font-semibold text-warning">{t("stop.closed", { month: monthName(closed) })}</p>}
          {!hasCoords(stop) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("stop.noPosition")} <a className="text-primary underline" href={placeSearchUrl(stop.name, area)} target="_blank" rel="noopener noreferrer">{t("stop.search")}</a>, {t("stop.searchHint")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <IconButton label={t("stop.moveUp")} disabled={first || busy} onClick={() => move(-1)}>↑</IconButton>
          <IconButton label={t("stop.moveDown")} disabled={last || busy} onClick={() => move(1)}>↓</IconButton>
        </div>
      </div>

      {stop.todos.length > 0 && (
        <div>
          <Eyebrow>{t("stop.todos", { done, total: stop.todos.length })}</Eyebrow>
          <ul className="mt-1">{stop.todos.map((x) => <TodoRow key={x.id} todo={x} />)}</ul>
        </div>
      )}
      <AddTodo stopId={stop.id} />

      <Chips>
        <ChipButton pressed={near} onClick={() => setNear((v) => !v)}>{t("stop.nearby")}</ChipButton>
        <ChipButton onClick={() => setEditing(true)}>{t("stop.edit")}</ChipButton>
      </Chips>
      {near && (
        <Chips>
          {NEARBY.map((n) => <ChipLink key={n.key} href={nearbyUrl(n.query, { ...stop, name: stop.name }, area, 13)}>{t(`near.${n.key}`)}</ChipLink>)}
        </Chips>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  const { call, tid } = useTrip();
  const { run, error } = useAction();
  const pending = usePendingChecks(tid);
  const done = pending.done("todo", todo.id, todo.done);
  return (
    <li className="flex items-center gap-2.5 border-t border-border py-1.5 first:border-t-0">
      <input
        type="checkbox" className="size-5 shrink-0 accent-[var(--primary)] pointer-coarse:size-6" checked={done}
        aria-label={t("stop.done", { text: todo.text })} onChange={(e) => queueCheck(tid, { kind: "todo", id: todo.id, done: e.target.checked })}
      />
      <CategoryTag category={todo.category} />
      <span className={cn("min-w-0 flex-1 break-words text-sm", done && "text-muted-foreground line-through")}>{todo.text}</span>
      <IconButton label={t("stop.removeTodo", { text: todo.text })} onClick={() => void run(() => call("DELETE", `/todos/${todo.id}`, undefined, ["plan"]))}>×</IconButton>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </li>
  );
}

function AddTodo({ stopId }: { stopId: number }) {
  const { call } = useTrip();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("se");
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => {
      await call("POST", `/stops/${stopId}/todos`, { text: text.trim(), category }, ["plan"]);
      setText("");
    });
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[8rem_1fr_auto]">
      <Select aria-label={t("stop.type")} value={category} onChange={(e) => setCategory(e.target.value as Category)} className="col-span-2 sm:col-span-1">
        {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
      </Select>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("stop.addTodo")} aria-label={t("stop.todoLabel")} />
      <Button type="submit" variant="outline" disabled={busy || !text.trim()}>{t("quick.add")}</Button>
      <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
    </form>
  );
}

function StopEdit({ stop, onDone }: { stop: Stop; onDone: () => void }) {
  const { call } = useTrip();
  const [name, setName] = useState(stop.name);
  const [pos, setPos] = useState(formatLatLon(stop));
  const [note, setNote] = useState(stop.note);
  const [from, setFrom] = useState(stop.openFrom ?? 0);
  const [to, setTo] = useState(stop.openTo ?? 0);
  const { run, busy, error, setError } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = readPosition(pos);
    if (p === "invalid") return setError(t("pos.invalid"));
    void run(async () => {
      const body: StopBody = { name: name.trim(), ...p, note: note.trim(), openFrom: from || null, openTo: to || null };
      await call("PATCH", `/stops/${stop.id}`, body, ["plan"]);
      onDone();
    });
  };
  const remove = () => {
    if (confirm(t("stop.confirmDelete", { name: stop.name }))) void run(() => call("DELETE", `/stops/${stop.id}`, undefined, ["plan"]));
  };
  const months = (
    <>
      <option value={0}>–</option>
      {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
    </>
  );
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-primary bg-background p-3">
      <Field label={t("stop.name")}><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label={t("stop.positionLabel")}><Input value={pos} onChange={(e) => setPos(e.target.value)} placeholder={t("day.positionPlaceholder")} inputMode="decimal" /></Field>
      <Field label={t("stop.note")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("stop.openFrom")}><Select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{months}</Select></Field>
        <Field label={t("stop.openTo")}><Select value={to} onChange={(e) => setTo(Number(e.target.value))}>{months}</Select></Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>{t("common.save")}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="button" variant="ghost" className="ml-auto text-danger" onClick={remove} disabled={busy}>{t("stop.delete")}</Button>
      </div>
    </form>
  );
}
