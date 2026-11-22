import { useState, type FormEvent } from "react";
import type { List, ListBody, Trip } from "@/shared/api";
import { useQuery } from "../api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { usePendingOps } from "../tripQueue";
import { Button, Dialog, EmptyState, ErrorText, Field, Input, Spinner } from "../ui";
import { PageHeader } from "../components/common";
import { CartIcon, PlusIcon } from "../components/icons";
import { ListCard } from "../components/ListCard";
import { ListSheet } from "../components/ListSheet";
import { StartTripDialog } from "../components/StartTripDialog";
import { t } from "../i18n";

export function Lists() {
  const h = useHousehold();
  const lists = useQuery<List[]>(`${h.base}/lists`);
  const trips = useQuery<Trip[]>(`${h.base}/trips`);
  const { statuses } = usePendingOps(h.hid);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);

  const inTrip = new Set((trips.data ?? []).filter((t) => t.status === "active").flatMap((t) => t.listIds));
  const sorted = [...(lists.data ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div>
      <PageHeader title={t("lists.title")}>
        <Button variant="outline" onClick={() => setStarting(true)} disabled={sorted.length === 0}><CartIcon className="size-4" />{t("lists.startTrip")}</Button>
        <Button className="hidden md:inline-flex" onClick={() => setCreating(true)}><PlusIcon className="size-4" />{t("lists.new")}</Button>
      </PageHeader>

      {lists.loading ? (
        <Spinner />
      ) : lists.error && !lists.data ? (
        <ErrorText>{lists.error.message}</ErrorText>
      ) : sorted.length === 0 ? (
        <EmptyState title={t("lists.emptyTitle")}>{t("lists.emptyBody")}</EmptyState>
      ) : (
        <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
          {sorted.map((l) => <ListCard key={l.id} list={l} inTrip={inTrip.has(l.id)} pending={statuses} onOpen={() => setOpenId(l.id)} />)}
        </div>
      )}

      <button
        type="button"
        aria-label={t("lists.new")}
        onClick={() => setCreating(true)}
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-lg active:scale-95 transition md:hidden"
      >
        <PlusIcon className="size-5" />{t("lists.new")}
      </button>

      <NewListDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />
      <ListSheet listId={openId} onClose={() => setOpenId(null)} />
      <StartTripDialog open={starting} onClose={() => setStarting(false)} />
    </div>
  );
}

function NewListDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { call } = useHousehold();
  const [title, setTitle] = useState("");
  const [store, setStore] = useState("");
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await call<{ id: number }>("POST", "/lists", { title: title.trim(), store: store.trim() || null } satisfies ListBody, ["lists"]);
      setTitle("");
      setStore("");
      onCreated(res.id);
    });
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("lists.new")}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("lists.titleLabel")}><Input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("lists.titlePlaceholder")} /></Field>
        <Field label={t("lists.storeOptional")}><Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="ICA" /></Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy || !title.trim()}>{t("lists.create")}</Button>
      </form>
    </Dialog>
  );
}
