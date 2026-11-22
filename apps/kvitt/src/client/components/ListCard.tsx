import type { ItemStatus, List } from "@/shared/api";
import { Badge, cn } from "../ui";
import { useHousehold } from "../household";
import { t } from "../i18n";
import { listBg } from "./format";

const PREVIEW = 8;

export function ListCard({ list, inTrip, pending, onOpen }: { list: List; inTrip: boolean; pending: Map<number, ItemStatus>; onOpen: () => void }) {
  const { name, me } = useHousehold();
  const items = list.items.slice(0, PREVIEW);
  const more = list.items.length - items.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("mb-3 block w-full break-inside-avoid rounded-lg border border-border p-3 text-left transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring", listBg[list.color])}
    >
      <div className="flex items-start gap-2">
        <h3 className="flex-1 font-medium break-words">{list.title || t("lists.untitled")}</h3>
        {inTrip && <Badge tone="warning">{t("lists.inTrip")}</Badge>}
      </div>
      {list.store && <div className="mt-0.5 text-xs text-muted-foreground">{list.store}</div>}
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((i) => {
            const status = pending.get(i.id) ?? i.status;
            const done = status === "checked" || status === "skipped";
            return (
              <li key={i.id} className={cn("flex gap-2", done && "text-muted-foreground line-through")}>
                <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-sm border border-muted-foreground/60" />
                <span className="min-w-0 break-words">{i.text}{i.quantity && <span className="text-muted-foreground"> · {i.quantity}</span>}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("lists.empty")}</p>
      )}
      {more > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("lists.more", { count: more })}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{list.ownerId === me.id ? t("lists.you") : name(list.ownerId)}</p>
    </button>
  );
}
