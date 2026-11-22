import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LIST_COLORS, type Item, type ItemBody, type ItemSuggestion, type List, type ListBody } from "@/shared/api";
import { useQuery } from "../api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { Button, cn, Dialog, ErrorText, IconButton, Input } from "../ui";
import { possessive, t as tr } from "../i18n";
import { listBg } from "./format";
import { CheckIcon, PlusIcon, TrashIcon } from "./icons";
import { ItemSuggestions, normText } from "./ItemSuggestions";

/** List detail: owners edit everything (D6), others see it read-only. */
export function ListSheet({ listId, onClose }: { listId: number | null; onClose: () => void }) {
  const h = useHousehold();
  const { data: lists } = useQuery<List[]>(`${h.base}/lists`);
  const list = lists?.find((l) => l.id === listId);

  // There are no empty lists: the server removes one when its last item goes (deleted or bought), and
  // a new list the owner closes without adding anything is deleted here. Either way the sheet closes.
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (list) shown.current = list.id;
    else if (listId != null && shown.current === listId && lists) { shown.current = null; onClose(); }
  }, [list, listId, lists, onClose]);
  const close = () => {
    if (list && list.ownerId === h.me.id && list.items.length === 0) void h.call("DELETE", `/lists/${list.id}`, undefined, ["lists"]).catch(() => {});
    onClose();
  };

  return (
    <Dialog open={listId != null} onClose={close} title={list ? (list.title || tr("lists.untitled")) : tr("sheet.list")} className={list ? listBg[list.color] : undefined}>
      {!list ? (
        <p className="text-sm text-muted-foreground">{tr("sheet.gone")}</p>
      ) : list.ownerId === h.me.id ? (
        <OwnerView key={list.id} list={list} onDeleted={onClose} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{list.store ? tr("sheet.readOnlyStore", { name: h.name(list.ownerId), owner: possessive(h.name(list.ownerId)), store: list.store }) : tr("sheet.readOnly", { name: h.name(list.ownerId), owner: possessive(h.name(list.ownerId)) })}</p>
          <ul className="divide-y divide-border">
            {list.items.map((i) => <ReadOnlyItem key={i.id} item={i} />)}
          </ul>
          {list.items.length === 0 && <p className="text-sm text-muted-foreground">{tr("sheet.noItems")}</p>}
        </div>
      )}
    </Dialog>
  );
}

function ReadOnlyItem({ item }: { item: Item }) {
  const done = item.status === "checked" || item.status === "skipped";
  return (
    <li className={cn("py-2 text-sm", done && "text-muted-foreground line-through")}>
      {item.text}{item.quantity && <span className="text-muted-foreground"> · {item.quantity}</span>}
      {item.note && <div className="text-xs text-muted-foreground">{item.note}</div>}
    </li>
  );
}

function OwnerView({ list, onDeleted }: { list: List; onDeleted: () => void }) {
  const { call } = useHousehold();
  const [title, setTitle] = useState(list.title);
  const [store, setStore] = useState(list.store ?? "");
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");
  const textRef = useRef<HTMLInputElement>(null);
  const { run, busy, error } = useAction();

  const patch = (body: Partial<ListBody>) => run(() => call("PATCH", `/lists/${list.id}`, body, ["lists"]));
  const saveMeta = () => {
    const t = title.trim() || tr("lists.untitled");
    const s = store.trim() || null;
    if (t !== list.title || s !== list.store) void patch({ title: t, store: s });
  };

  // Texts just added from a chip, keyed to list.updatedAt at tap time: hidden until the refetched list contains them.
  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const exclude = useMemo(() => {
    const s = new Set(list.items.map((i) => normText(i.text)));
    for (const [t, v] of pending) if (v === list.updatedAt) s.add(t);
    return s;
  }, [list.items, list.updatedAt, pending]);

  const addItem = (t: string, quantity: string | null) => {
    setText("");
    setQty("");
    textRef.current?.focus();
    void run(() => call("POST", `/lists/${list.id}/items`, { text: t, quantity } satisfies ItemBody, ["lists"]));
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (t) addItem(t, qty.trim() || null);
  };
  const pick = (s: ItemSuggestion) => {
    setPending((m) => new Map(m).set(normText(s.text), list.updatedAt));
    addItem(s.text, qty.trim() || s.quantity);
  };

  const remove = () => {
    if (!confirm(tr("sheet.confirmDelete", { title: list.title }))) return;
    void run(async () => {
      await call("DELETE", `/lists/${list.id}`, undefined, ["lists"]);
      onDeleted();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <Input aria-label={tr("sheet.title")} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} placeholder={tr("sheet.title")} className="font-medium" />
        <Input aria-label={tr("sheet.store")} value={store} onChange={(e) => setStore(e.target.value)} onBlur={saveMeta} placeholder={tr("sheet.store")} />
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr("sheet.color")}>
        {LIST_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={list.color === c}
            aria-label={tr(`color.${c}`)}
            onClick={() => void patch({ color: c })}
            className={cn("size-7 rounded-full border border-border", listBg[c], list.color === c && "outline-2 outline-offset-2 outline-ring")}
          />
        ))}
      </div>

      <div className="space-y-2">
        <form onSubmit={add} className="flex gap-2">
          <Input ref={textRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("sheet.addItem")} enterKeyHint="enter" autoFocus />
          <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder={tr("sheet.qty")} className="w-20" aria-label={tr("sheet.quantity")} />
          <IconButton type="submit" label={tr("sheet.addItem")} className="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:opacity-90"><PlusIcon /></IconButton>
        </form>
        <ItemSuggestions query={text} exclude={exclude} onPick={pick} />
      </div>

      <ul className="divide-y divide-border">
        {list.items.map((i) => <EditableItem key={i.id} item={i} />)}
      </ul>
      {list.items.length === 0 && <p className="text-sm text-muted-foreground">{tr("sheet.noItemsYet")}</p>}

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button variant="ghost" className="text-danger" onClick={remove} disabled={busy}><TrashIcon className="size-4" />{tr("sheet.deleteList")}</Button>
      </div>
    </div>
  );
}

function EditableItem({ item }: { item: Item }) {
  const { call } = useHousehold();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [qty, setQty] = useState(item.quantity ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const { run, busy, error } = useAction();
  const done = item.status === "checked" || item.status === "skipped";

  const startEdit = () => {
    setText(item.text);
    setQty(item.quantity ?? "");
    setNote(item.note ?? "");
    setEditing(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await call("PATCH", `/items/${item.id}`, { text: text.trim() || item.text, quantity: qty.trim() || null, note: note.trim() || null } satisfies ItemBody, ["lists"]);
      setEditing(false);
    });
  };
  const del = () => void run(() => call("DELETE", `/items/${item.id}`, undefined, ["lists"]));

  if (!editing)
    return (
      <li className="flex items-center gap-2 py-1">
        <button type="button" onClick={startEdit} className={cn("min-w-0 flex-1 py-1 text-left text-sm", done && "text-muted-foreground line-through")}>
          {item.text}{item.quantity && <span className="text-muted-foreground"> · {item.quantity}</span>}
          {item.note && <span className="block text-xs text-muted-foreground">{item.note}</span>}
        </button>
        <IconButton label={tr("sheet.deleteItem")} onClick={del} disabled={busy}><TrashIcon className="size-4" /></IconButton>
      </li>
    );
  return (
    <li className="py-2">
      <form onSubmit={save} className="space-y-2">
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label={tr("sheet.item")} />
          <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder={tr("sheet.qty")} className="w-20" aria-label={tr("sheet.quantity")} />
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("sheet.note")} aria-label={tr("sheet.note")} />
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{tr("sheet.cancel")}</Button>
          <Button type="submit" disabled={busy}><CheckIcon className="size-4" />{tr("sheet.save")}</Button>
        </div>
      </form>
    </li>
  );
}
