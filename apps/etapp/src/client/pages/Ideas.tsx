/** The idea bank: places saved for later (often straight from a video or a thread), put on a day when you know where. */
import { useState, type FormEvent } from "react";
import { parsePlace } from "@/shared/quick";
import { useAction } from "../hooks";
import { useTrip } from "../trip";
import { useCurrentDay, usePlan } from "../plan";
import { Button, EmptyState, ErrorText, Input, PageSkeleton } from "../ui";
import { PageHeader } from "../components/common";
import { IdeaCard, StopPanel } from "../components/Stop";
import { t, tn } from "../i18n";

export function Ideas() {
  const q = usePlan();
  const { call } = useTrip();
  const [text, setText] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const { run, busy, error } = useAction();
  const plan = q.data;
  const { idx } = useCurrentDay(plan ?? { area: "", startMode: "home", startText: "", startDate: null, days: [] });
  if (!plan) return q.error ? <ErrorText>{q.error.message}</ErrorText> : <PageSkeleton cards={2} columns="" />;

  /** A pasted link becomes an unnamed idea with that link (rename it when opened); anything else is a place. */
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    const isLink = /^https?:\/\//i.test(v);
    const p = parsePlace(v);
    const body = isLink && p.lat === null ? { name: t("ideas.unnamed"), url: v } : { name: p.name || t("ideas.unnamed"), lat: p.lat, lon: p.lon, url: isLink ? v : "" };
    void run(async () => {
      const r = await call<{ id: number }>("POST", "/ideas", body, ["plan"]);
      setText("");
      if (isLink) setOpen(r.id);
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("ideas.title")}>
        <span className="text-sm text-muted-foreground">{tn("ideas.count", plan.ideas.length)}</span>
      </PageHeader>
      <form onSubmit={submit} className="space-y-1.5">
        <label htmlFor="idea-new" className="text-sm font-semibold">{t("ideas.save")}</label>
        <div className="flex gap-2">
          <Input id="idea-new" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("ideas.placeholder")} className="h-11" />
          <Button type="submit" disabled={busy || !text.trim()} className="h-11 shrink-0">{t("add.submit")}</Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
      {plan.ideas.length === 0 ? (
        <EmptyState title={t("ideas.empty")} />
      ) : (
        <ul className="space-y-2.5">
          {plan.ideas.map((s) => (open === s.id ? (
            <li key={s.id}><StopPanel plan={plan} stop={s} no={null} dayIndex={null} onClose={() => setOpen(null)} /></li>
          ) : (
            <IdeaCard key={s.id} plan={plan} idea={s} targetDay={idx} onOpen={() => setOpen(s.id)} />
          )))}
        </ul>
      )}
    </div>
  );
}
