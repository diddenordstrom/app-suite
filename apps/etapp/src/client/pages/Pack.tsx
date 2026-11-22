import { useState, type FormEvent } from "react";
import type { PackItem } from "@/shared/api";
import { PACK_GROUPS, type PackGroup } from "@/shared/packing";
import { useAction } from "../hooks";
import { queueCheck, usePendingChecks } from "../checkQueue";
import { useTrip } from "../trip";
import { usePlan } from "../plan";
import { Button, Card, cn, ErrorText, IconButton, Input, Select, PageSkeleton } from "../ui";
import { Eyebrow } from "../components/bits";
import { PageHeader } from "../components/common";
import { t } from "../i18n";

export function Pack() {
  const q = usePlan();
  if (!q.data) return q.error ? <ErrorText>{q.error.message}</ErrorText> : <PageSkeleton rows={6} />;
  return <PackList pack={q.data.pack} />;
}

function PackList({ pack }: { pack: PackItem[] }) {
  const { call, tid } = useTrip();
  const { run, busy, error } = useAction();
  const pending = usePendingChecks(tid);
  const isDone = (x: PackItem) => pending.done("pack", x.id, x.done);
  const done = pack.filter(isDone).length;
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.pack")} />
      <Card className="space-y-3">
        <p className="text-sm tabular-nums text-muted-foreground">{t("pack.packed", { done, total: pack.length })}</p>
        {pack.length === 0 && (
          <>
            <p className="text-sm text-muted-foreground">{t("pack.empty")}</p>
            <Button disabled={busy} onClick={() => void run(() => call("POST", "/pack/starter", undefined, ["plan"]))}>{t("pack.starter")}</Button>
            <ErrorText>{error}</ErrorText>
          </>
        )}
      </Card>
      {PACK_GROUPS.map((g) => {
        const items = pack.filter((x) => x.group === g);
        if (!items.length) return null;
        return (
          <Card key={g}>
            <Eyebrow>{t(`pack.g.${g}`)} · {items.filter(isDone).length} / {items.length}</Eyebrow>
            <ul className="mt-1">{items.map((x) => <PackRow key={x.id} item={x} done={isDone(x)} />)}</ul>
          </Card>
        );
      })}
      <AddItem />
    </div>
  );
}

function PackRow({ item, done }: { item: PackItem; done: boolean }) {
  const { call, tid } = useTrip();
  const { run } = useAction();
  return (
    <li className="flex items-center gap-2.5 border-t border-border py-1.5 first:border-t-0">
      <input
        type="checkbox" className="size-5 shrink-0 accent-[var(--primary)] pointer-coarse:size-6" checked={done}
        aria-label={t("pack.done", { text: item.text })}
        onChange={(e) => queueCheck(tid, { kind: "pack", id: item.id, done: e.target.checked })}
      />
      <span className={cn("min-w-0 flex-1 break-words text-sm", done && "text-muted-foreground line-through")}>{item.text}</span>
      <IconButton label={t("pack.remove", { text: item.text })} onClick={() => void run(() => call("DELETE", `/pack/${item.id}`, undefined, ["plan"]))}>×</IconButton>
    </li>
  );
}

function AddItem() {
  const { call } = useTrip();
  const [group, setGroup] = useState<PackGroup>("other");
  const [text, setText] = useState("");
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => { await call("POST", "/pack", { group, text: text.trim() }, ["plan"]); setText(""); });
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-2">
        <Eyebrow>{t("pack.addTitle")}</Eyebrow>
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <Select aria-label={t("pack.group")} value={group} onChange={(e) => setGroup(e.target.value as PackGroup)} className="col-span-2 sm:col-span-1">
            {PACK_GROUPS.map((g) => <option key={g} value={g}>{t(`pack.g.${g}`)}</option>)}
          </Select>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("pack.placeholder")} aria-label={t("pack.item")} />
          <Button type="submit" variant="outline" disabled={busy || !text.trim()}>{t("quick.add")}</Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}
