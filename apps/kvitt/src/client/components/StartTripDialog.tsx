import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { List, StartTripBody, Trip } from "@/shared/api";
import { useQuery } from "../api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { Button, cn, Dialog, ErrorText, Field, Input } from "../ui";
import { t, tn } from "../i18n";
import { listBg } from "./format";

export function StartTripDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t("start.title")}>
      {open && <StartTripForm onClose={onClose} />}
    </Dialog>
  );
}

function StartTripForm({ onClose }: { onClose: () => void }) {
  const h = useHousehold();
  const lists = useQuery<List[]>(`${h.base}/lists`).data ?? [];
  const trips = useQuery<Trip[]>(`${h.base}/trips`).data ?? [];
  const busyLists = new Set(trips.filter((t) => t.status === "active").flatMap((t) => t.listIds));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [store, setStore] = useState("");
  const { run, busy, error } = useAction();
  const navigate = useNavigate();

  const toggle = (id: number) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
    // Prefill the store when all selected lists share one.
    const stores = new Set(lists.filter((l) => n.has(l.id)).map((l) => l.store).filter((s): s is string => !!s));
    if (!store && stores.size === 1) setStore([...stores][0]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const trip = await h.call<Trip>("POST", "/trips", { listIds: [...selected], store: store.trim() || null } satisfies StartTripBody, ["trips", "lists"]);
      onClose();
      navigate(`/trip?id=${trip.id}`);
    });
  };

  const sorted = [...lists].sort((a, b) => Number(b.ownerId === h.me.id) - Number(a.ownerId === h.me.id) || a.title.localeCompare(b.title));
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("start.intro")}</p>
      <ul className="space-y-2">
        {sorted.map((l) => {
          const disabled = busyLists.has(l.id);
          const open = l.items.filter((i) => i.status === "open").length;
          return (
            <li key={l.id}>
              <label className={cn("flex items-center gap-3 rounded-md border border-border p-3", listBg[l.color], disabled ? "opacity-50" : "cursor-pointer")}>
                <input type="checkbox" className="size-4" checked={selected.has(l.id)} disabled={disabled} onChange={() => toggle(l.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.title || t("lists.untitled")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {l.ownerId === h.me.id ? t("lists.you") : h.name(l.ownerId)} · {tn("start.items", open)}{l.store ? ` · ${l.store}` : ""}{disabled ? ` · ${t("start.busy")}` : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {lists.length === 0 && <p className="text-sm text-muted-foreground">{t("start.noLists")}</p>}
      <Field label={t("lists.storeOptional")}><Input value={store} onChange={(e) => setStore(e.target.value)} placeholder={t("start.storePlaceholder")} /></Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || selected.size === 0}>{t("start.submit", { count: selected.size })}</Button>
    </form>
  );
}
