/**
 * "Lägg till": one sheet for everything you add to a day. Pick stop, via, night or idea, type or paste the place
 * (name, coordinates or a long Maps link) and add. Quick entry stays for pasting many lines at once.
 */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { PlanResponse } from "@/shared/api";
import { parsePlace } from "@/shared/quick";
import { closeAdd, useAddSheet, type AddKind } from "../addSheet";
import { useAction } from "../hooks";
import { useTrip } from "../trip";
import { useCurrentDay, usePlan } from "../plan";
import { Button, Dialog, ErrorText, Field, Input, SegmentedControl } from "../ui";
import { t } from "../i18n";

export function AddSheet() {
  const sheet = useAddSheet();
  const q = usePlan();
  if (!sheet.open || !q.data) return null;
  return <Sheet plan={q.data} initial={sheet.kind} />;
}

function Sheet({ plan, initial }: { plan: PlanResponse; initial: AddKind }) {
  const { call } = useTrip();
  const navigate = useNavigate();
  const { idx } = useCurrentDay(plan);
  const day = plan.days[idx];
  const [kind, setKind] = useState<AddKind>(initial);
  const [place, setPlace] = useState("");
  const [todos, setTodos] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const { run, busy, error } = useAction();
  const parsed = parsePlace(place);
  const hasPos = parsed.lat !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.name && !(kind === "night" && hasPos)) return;
    void run(async () => {
      const pos = { lat: parsed.lat, lon: parsed.lon };
      if (kind === "night") {
        await call("PATCH", `/days/${day.id}`, { sleepName: parsed.name, ...(hasPos ? { sleepLat: parsed.lat, sleepLon: parsed.lon } : {}) }, ["plan"]);
      } else if (kind === "idea") {
        await call("POST", "/ideas", { name: parsed.name, ...pos, url: url.trim() }, ["plan"]);
      } else {
        await call("POST", `/days/${day.id}/stops`, { name: parsed.name, kind, ...pos, todos: kind === "stop" ? todos : "", url: kind === "stop" ? url.trim() : "" }, ["plan"]);
      }
      setMsg(t("add.added", { name: parsed.name || t("night.default") }));
      setPlace(""); setTodos(""); setUrl("");
      if (kind === "night") closeAdd();
    });
  };

  const hint = kind === "via" ? t("add.viaHint") : kind === "night" ? t("add.nightHint", { n: idx + 1 }) : kind === "idea" ? t("add.ideaHint") : "";
  return (
    <Dialog open onClose={closeAdd} title={kind === "idea" ? t("add.titleIdea") : t("add.title", { n: idx + 1 })}>
      <form onSubmit={submit} className="space-y-4">
        <SegmentedControl<AddKind>
          aria-label={t("stop.type")} value={kind} onChange={(v) => { setKind(v); setMsg(""); }} className="grid w-full grid-cols-4"
          options={[
            { value: "stop", label: t("add.kindStop") }, { value: "via", label: t("add.kindVia") },
            { value: "night", label: t("add.kindNight") }, { value: "idea", label: t("add.kindIdea") },
          ]}
        />
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <Field
          label={t("add.place")}
          hint={place.trim() ? (parsed.warning === "shortLink" ? t("quick.shortLink", { line: 1 }) : hasPos ? t("add.found") : t("add.nameOnly")) : undefined}
        >
          <Input value={place} onChange={(e) => { setPlace(e.target.value); setMsg(""); }} placeholder={t("add.placePlaceholder")} autoFocus className="h-12 text-base" />
        </Field>
        {kind === "stop" && (
          <Field label={t("add.todos")}>
            <Input value={todos} onChange={(e) => setTodos(e.target.value)} placeholder={t("add.todosPlaceholder")} />
          </Field>
        )}
        {(kind === "stop" || kind === "idea") && (
          <Field label={t("add.link")}>
            <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
        )}
        {msg && <p role="status" className="text-sm text-success">{msg}</p>}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || (!parsed.name && !(kind === "night" && hasPos))} className="h-12 w-full text-base font-bold">{t("add.submit")}</Button>
        {kind !== "idea" && (
          <button type="button" className="block w-full text-center text-sm font-semibold text-primary" onClick={() => { closeAdd(); navigate("/?quick=1"); }}>
            {t("add.quick")}
          </button>
        )}
      </form>
    </Dialog>
  );
}
