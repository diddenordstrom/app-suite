import { useState, type FormEvent } from "react";
import type { Expense, ExpenseBody } from "@/shared/api";
import { parseAmount, splitAmount, splitWithGuests, type SplitMode } from "@/shared/balances";
import { carTotal as carTotalOf } from "@/shared/car";
import { giftByDefault, MAX_GUESTS } from "@/shared/gifts";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { Button, ErrorText, Field, Input, SegmentedControl, Select, Textarea } from "../ui";
import { toInput, today } from "./format";
import { CategoryChips, Stepper } from "./treats";
import { CarIcon, TrashIcon } from "./icons";
import { CarCalculator } from "./CarCalculator";
import type { CarCalc } from "@/shared/car";
import { t } from "../i18n";

type Part = { on: boolean; weight: string };

/** Add or edit an expense (D9). `expense` set = edit mode. */
export function ExpenseForm({ expense, onDone }: { expense?: Expense; onDone: () => void }) {
  const h = useHousehold();
  const settings = h.detail.settings;
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? toInput(expense.amount) : "");
  const [payerId, setPayerId] = useState(expense?.payerId ?? h.me.id);
  const [date, setDate] = useState(expense?.date ?? today());
  const [mode, setMode] = useState<SplitMode>(expense?.splitMode ?? "equal");
  const [category, setCategory] = useState(expense?.category ?? "");
  const [note, setNote] = useState(expense?.note ?? "");
  // Bjudet (a treat) or delas (shared). New expenses follow the category's default until the user picks.
  const [gift, setGift] = useState(expense?.gift ?? false);
  const [modeTouched, setModeTouched] = useState(!!expense);
  const [guests, setGuests] = useState(expense?.guests ?? 0);
  // Bilutgift: the calculator fills in the amount; `car` is null while it is closed or incomplete.
  const [carOpen, setCarOpen] = useState(!!expense?.car);
  const [car, setCar] = useState<CarCalc | null>(expense?.car ?? null);
  const pickCategory = (c: string) => {
    setCategory(c);
    if (!modeTouched) setGift(giftByDefault(c, settings.giftCategories));
  };
  // Active members plus anyone (e.g. removed) already in this expense.
  const people = [...h.members, ...(expense?.shares ?? []).map((s) => h.member(s.memberId)).filter((m) => m && m.removed)].filter((m) => !!m);
  const [parts, setParts] = useState<Record<number, Part>>(() => Object.fromEntries(people.map((m) => {
    const share = expense?.shares.find((s) => s.memberId === m.id);
    const weight = share ? (expense!.splitMode === "exact" ? toInput(share.amount) : String(share.weight)) : (expense?.splitMode === "exact" ? "" : "1");
    return [m.id, { on: expense ? !!share : !m.managed, weight }];
  })));
  const { run, busy, error, setError } = useAction();

  const total = parseAmount(amount);
  // For a treat the host is not a guest at their own table: the list is who else was there.
  const chosen = people.filter((m) => parts[m.id]?.on && !(gift && m.id === payerId));
  const weights = chosen.map((m) => {
    const w = parts[m.id].weight.trim();
    return { memberId: m.id, weight: gift || mode === "equal" ? 1 : mode === "shares" ? (/^\d+$/.test(w) ? Number(w) : NaN) : (parseAmount(w || "0") ?? NaN) };
  });
  const guestCount = gift || mode === "equal" ? guests : 0;
  let preview: Map<number, number> | null = null;
  let guestAmount = 0;
  try {
    if (!gift && total && total > 0) {
      if (guestCount > 0) {
        const r = splitWithGuests(total, weights.map((w) => w.memberId), guestCount);
        preview = new Map(r.shares.map((s) => [s.memberId, s.amount]));
        guestAmount = r.guestAmount;
      } else preview = new Map(splitAmount(total, mode, weights).map((s) => [s.memberId, s.amount]));
    }
  } catch {
    // Invalid split (e.g. bad weights): preview stays null and submit asks to check the split.
  }
  const exactSum = mode === "exact" ? weights.reduce((s, w) => s + (Number.isNaN(w.weight) ? 0 : w.weight), 0) : 0;

  const setPart = (id: number, p: Partial<Part>) => setParts({ ...parts, [id]: { ...parts[id], ...p } });
  const onCar = (c: CarCalc | null) => {
    setCar(c);
    const minor = c && carTotalOf(c);
    if (minor !== null && minor !== undefined) setAmount(toInput(minor));
  };
  // With the calculator open on a new expense, the driver follows the payer: the new one is unticked, the old one back in.
  const changePayer = (id: number) => {
    if (carOpen && !expense?.car) setParts((ps) => ({ ...ps, ...(ps[payerId] && { [payerId]: { ...ps[payerId], on: true } }), ...(ps[id] && { [id]: { ...ps[id], on: false } }) }));
    setPayerId(id);
  };
  const openCar = () => {
    setCarOpen(true);
    // Usually the passengers pay for the drive: the driver starts unticked (tick them back in to share).
    if (!expense?.car) setParts((ps) => (ps[payerId] ? { ...ps, [payerId]: { ...ps[payerId], on: false } } : ps));
  };
  const switchMode = (m: SplitMode) => {
    setMode(m);
    if (m !== "equal") setGuests(0);
    // Reset weights to a sensible default for the new mode.
    setParts(Object.fromEntries(Object.entries(parts).map(([id, p]) => [id, { ...p, weight: m === "exact" ? "" : "1" }])));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let body: ExpenseBody;
    if (gift) {
      // A treat may be unpriced and never needs attendees; it never creates a debt.
      if (amount.trim() && total === null) return setError(t("expense.invalidAmount"));
      body = {
        title: title.trim(), amount: total ?? 0, payerId, splitMode: "equal", date, gift: true, guests: guestCount,
        category: category.trim() || null, note: note.trim() || null,
        participants: weights,
      };
    } else {
      if (carOpen && !car) return setError(t("car.incomplete"));
      if (!total || total <= 0) return setError(t("expense.invalidAmount"));
      if (chosen.length === 0) return setError(t("expense.pickParticipant"));
      if (!preview) return setError(t("expense.checkSplit"));
      body = {
        title: title.trim(), amount: total, payerId, splitMode: mode, date, gift: false, guests: guestCount,
        category: category.trim() || null, note: note.trim() || null,
        participants: weights, car: carOpen ? car : null,
      };
    }
    void run(async () => {
      if (expense) await h.call("PATCH", `/expenses/${expense.id}`, body, ["expenses", "balances"]);
      else await h.call("POST", "/expenses", body, ["expenses", "balances"]);
      onDone();
    });
  };

  const remove = () => {
    if (!expense || !confirm(t("expense.confirmDelete", { title: expense.title }))) return;
    void run(async () => {
      await h.call("DELETE", `/expenses/${expense.id}`, undefined, ["expenses", "balances"]);
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t("expense.title")}><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("expense.titlePlaceholder")} autoFocus={!expense} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("expense.amount", { currency: h.currency })} hint={gift ? t("expense.giftAmountHint") : undefined}><Input required={!gift} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={gift ? t("common.optional") : "0"} /></Field>
        <Field label={t("expense.date")}><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {!gift && (carOpen ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium"><CarIcon className="size-4" />{t("car.title")}</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setCarOpen(false); setCar(null); }}>{t("car.close")}</button>
          </div>
          <CarCalculator driverId={payerId} initial={expense?.car ?? null} excludeId={expense?.id} onChange={onCar} />
          {!parts[payerId]?.on && <p className="text-xs text-muted-foreground">{t("car.driverOut", { name: h.name(payerId) })}</p>}
        </div>
      ) : (
        <button type="button" onClick={openCar} className="flex items-center gap-1.5 rounded-md bg-signature-soft px-3 py-2 text-sm font-medium text-signature-foreground">
          <CarIcon className="size-4" />{t("car.open")}
        </button>
      ))}
      <div className="space-y-2">
        <span className="text-sm font-medium">{t("expense.category")}</span>
        <CategoryChips value={category} onChange={pickCategory} />
      </div>
      <div className="space-y-2">
        <SegmentedControl className="w-full" aria-label={t("expense.mode")} value={gift ? "gift" : "shared"} onChange={(v) => { setGift(v === "gift"); setModeTouched(true); }} options={[{ value: "gift", label: t("expense.modeGift") }, { value: "shared", label: t("expense.modeShared") }]} />
        {category && !modeTouched && <p className="text-xs text-muted-foreground">{t(giftByDefault(category, settings.giftCategories) ? "expense.modeDefaultGift" : "expense.modeDefaultShared")}</p>}
      </div>
      <Field label={gift ? t("expense.hostedBy") : t("expense.paidBy")}>
        <Select value={payerId} onChange={(e) => changePayer(Number(e.target.value))}>
          {people.map((m) => <option key={m.id} value={m.id}>{m.id === h.me.id ? t("common.nameYou", { name: m.name }) : m.name}</option>)}
        </Select>
      </Field>

      {gift ? (
        <div className="space-y-2">
          <span className="text-sm font-medium">{t("expense.whoWasThere")}</span>
          <ul className="divide-y divide-border rounded-md border border-border">
            {people.filter((m) => m.id !== payerId).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <label className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={!!parts[m.id]?.on} onChange={(e) => setPart(m.id, { on: e.target.checked })} />
                  <span className="truncate">{m.id === h.me.id ? t("common.you") : m.name}</span>
                </label>
              </li>
            ))}
            <GuestRow guests={guests} setGuests={setGuests} />
          </ul>
          <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">{t("expense.giftNote", { name: h.name(payerId) })}</p>
        </div>
      ) : (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t("expense.split")}</span>
          <SegmentedControl value={mode} onChange={switchMode} options={[{ value: "equal", label: t("expense.splitEqual") }, { value: "shares", label: t("expense.splitShares") }, { value: "exact", label: t("expense.splitExact") }]} />
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {people.map((m) => {
            const p = parts[m.id];
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={p.on} onChange={(e) => setPart(m.id, { on: e.target.checked })} />
                  <span className="truncate">{m.id === h.me.id ? t("common.you") : m.name}</span>
                </label>
                {p.on && mode !== "equal" && (
                  <Input aria-label={mode === "shares" ? t("expense.splitShares") : t("expense.amountShort")} inputMode={mode === "shares" ? "numeric" : "decimal"} value={p.weight} onChange={(e) => setPart(m.id, { weight: e.target.value })} className="h-8 w-20 text-right" placeholder={mode === "shares" ? "1" : "0"} />
                )}
                {p.on && mode !== "exact" && <span className="w-20 text-right text-sm text-muted-foreground tabular-nums">{preview?.has(m.id) ? h.fmt(preview.get(m.id)!) : "–"}</span>}
              </li>
            );
          })}
          {mode === "equal" && <GuestRow guests={guests} setGuests={setGuests} share={guestCount > 0 && preview ? guestAmount / guestCount : undefined} />}
        </ul>
        {mode === "equal" && guestCount > 0 && guestAmount > 0 && <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">{t(guestCount === 1 ? "expense.guestNote" : "expense.guestsNote", { amount: h.fmt(guestAmount) })}</p>}
        {mode === "exact" && total ? (
          <p className={total - exactSum === 0 ? "text-sm text-success" : "text-sm text-warning"}>
            {total - exactSum === 0 ? t("expense.addsUp") : total - exactSum > 0 ? t("expense.leftToAssign", { amount: h.fmt(total - exactSum) }) : t("expense.tooMuch", { amount: h.fmt(exactSum - total) })}
          </p>
        ) : null}
      </div>
      )}

      <Field label={t("expense.note")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("common.optional")} className="min-h-16" /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        {expense && <Button type="button" variant="ghost" className="text-danger" onClick={remove} disabled={busy}><TrashIcon className="size-4" />{t("common.delete")}</Button>}
        <Button type="submit" className="flex-1" disabled={busy || !title.trim()}>{expense ? t("common.save") : t("expense.add")}</Button>
      </div>
    </form>
  );
}

/** Anonymous guests: a count, no names and no accounts. */
function GuestRow({ guests, setGuests, share }: { guests: number; setGuests: (n: number) => void; share?: number }) {
  const h = useHousehold();
  return (
    <li className="flex items-center gap-3 py-0.5 pr-1 pl-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t("expense.guests")}</span>
        <span className="block text-xs text-muted-foreground">{t("expense.guestsHint")}</span>
      </span>
      <Stepper value={guests} max={MAX_GUESTS} onChange={setGuests} lessLabel={t("expense.guestsFewer")} moreLabel={t("expense.guestsMore")} />
      {share !== undefined && <span className="w-16 text-right text-sm text-muted-foreground tabular-nums">{h.fmt(Math.round(share))}</span>}
    </li>
  );
}
