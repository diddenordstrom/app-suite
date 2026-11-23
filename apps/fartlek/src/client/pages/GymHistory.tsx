import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, useAction, useApi } from "../http";
import { BusyButton, Card, CardTitle, EmptyState, ErrorText, IconButton, Spinner } from "../ui";
import { fmtDay } from "../bits";
import { locale, t } from "../i18n";
import { exName, setsText, useOutbox } from "../gymlog";
import type { GymSessionFull, GymSummary } from "@/shared/gymplan";

const cap = (x: string) => x.charAt(0).toLocaleUpperCase(locale) + x.slice(1);

/** Gym history (docs/decisions/fartlek-gym-module.md): logged and imported sessions, and the Bolt import. */
export function GymHistory() {
  const { data, error, reload } = useApi<GymSummary[]>("/gym/sessions?limit=100");
  const waiting = useOutbox(reload);
  const [open, setOpen] = useState<number | null>(null);
  const del = useAction((id: number) => api(`/gym/sessions/${id}`, { method: "DELETE" }), reload);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("gym.history")}</h1>
        <Link to="/gym" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">{t("gym.newSession")}</Link>
      </div>
      {waiting > 0 && <p className="rounded-md bg-signature-soft px-3 py-2 text-sm text-signature-foreground">{t("gym.pending", { n: waiting })}</p>}
      <ErrorText>{error ?? del.error}</ErrorText>
      {!data ? <div className="grid place-items-center py-10"><Spinner /></div> : data.length === 0 ? <EmptyState title={t("gym.historyEmpty")} /> : (
        <Card className="p-0">
          <ul>
            {data.map((s) => (
              <li key={s.id} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-2 py-1 pr-1 pl-4">
                  <button type="button" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)} className="min-w-0 flex-1 py-2 text-left">
                    <span className="block font-medium">
                      {cap(fmtDay(s.date, { weekday: "short", day: "numeric", month: "short" }))} · {s.template ? t(`gym.template.${s.template}`) : s.name ?? t("gym.free")}
                      {s.source === "bolt" && <span className="text-xs font-normal text-muted-foreground"> · {t("gym.source.bolt")}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{t("gym.summary", { sets: s.sets, exercises: s.exercises.map(exName).join(", ") })}</span>
                  </button>
                  <IconButton className="size-11" label={t("gym.remove")} onClick={() => { if (window.confirm(t("gym.deleteConfirm"))) void del.run(s.id); }}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </IconButton>
                </div>
                {open === s.id && <SessionDetail id={s.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Import onDone={reload} />
    </div>
  );
}

function SessionDetail({ id }: { id: number }) {
  const { data } = useApi<GymSessionFull>(`/gym/sessions/${id}`);
  if (!data) return <div className="px-4 pb-3"><Spinner /></div>;
  return (
    <ul className="space-y-1 px-4 pb-3 text-sm">
      {data.entries.map((e, i) => (
        <li key={i} className="flex justify-between gap-3"><span>{exName(e.exercise)}</span><span className="text-right text-muted-foreground tabular-nums">{setsText(e.sets)}</span></li>
      ))}
    </ul>
  );
}

function Import({ onDone }: { onDone: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ added: number; skipped: number; sets: number; unknown: string[] } | null>(null);
  const run = useAction(async (f: File) => {
    setResult(await api("/gym/import", { body: { csv: await f.text() } }));
  }, onDone);
  return (
    <Card className="space-y-3">
      <CardTitle>{t("gym.import")}</CardTitle>
      <p className="text-sm text-muted-foreground">{t("gym.importHint")}</p>
      <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run.run(f); e.target.value = ""; }} />
      <BusyButton variant="outline" busy={run.busy} onClick={() => file.current?.click()}>{t("gym.importChoose")}</BusyButton>
      {result && (
        <div className="space-y-1 text-sm">
          <p>{t("gym.imported", { added: result.added, sets: result.sets, skipped: result.skipped })}</p>
          {result.unknown.length > 0 && <p className="text-muted-foreground">{t("gym.unknown", { names: new Intl.ListFormat(locale, { type: "conjunction" }).format(result.unknown) })}</p>}
        </div>
      )}
      <ErrorText>{run.error}</ErrorText>
    </Card>
  );
}
