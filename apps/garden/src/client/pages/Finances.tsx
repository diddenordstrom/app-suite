import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Dialog, Input, cn } from "../ui";
import { api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { t } from "../i18n";
import { reportError } from "../toast";
import { Combobox } from "../components/Combobox";
import { Chip, PageTitle, PlusIcon, SearchInput, SectionTitle, Skeleton } from "../components/common";
import { SortMenu } from "../components/SortMenu";
import { formatKr, today } from "../lib/format";

interface Expense { id: number; householdId: number; name: string; cost: number; date: string; cropId: number | null; locationId: number | null }
interface Named { id: number; name: string }
interface PerCropRow { cropId: number; cropName: string; pricePerKg: number | null; spent: number; realized: number; forecast: number; net: number }
interface FinancesSummary { totals: { spent: number; realized: number; forecast: number; net: number }; perCrop: PerCropRow[] }
type SortKey = "date" | "cost" | "name";

const emptyForm = () => ({ name: "", cost: "", date: today(), cropId: undefined as number | undefined, locationId: undefined as number | undefined });

export function Finances() {
  const { current } = useHousehold();
  const hid = current.id;
  const { data, setData, loading } = useLoad(async () => {
    const [crops, locations, expenses] = await Promise.all([get<Named[]>("/crops"), get<Named[]>("/location"), get<Expense[]>("/expense", { householdId: hid })]);
    return { crops, locations, expenses };
  }, [hid]);
  const [year, setYear] = useState(new Date().getFullYear());
  const summaryQ = useLoad(() => get<FinancesSummary>("/finances", { householdId: hid, year }), [hid, year]);
  const summary = summaryQ.data;
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const expenses = useMemo(() => data?.expenses ?? [], [data]);
  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()]);
    for (const e of expenses) { const y = parseInt(e.date.slice(0, 4), 10); if (!isNaN(y)) ys.add(y); }
    return [...ys].sort((a, b) => b - a);
  }, [expenses]);

  const filtered = useMemo(() => {
    let list = expenses.filter((e) => parseInt(e.date.slice(0, 4), 10) === year);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    const dir = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => sortKey === "date" ? dir * a.date.localeCompare(b.date) : sortKey === "cost" ? dir * (a.cost - b.cost) : dir * a.name.localeCompare(b.name));
  }, [expenses, year, query, sortKey, sortDesc]);

  const name = (list: Named[] | undefined, id: number | null) => (id === null ? null : list?.find((x) => x.id === id)?.name ?? null);
  const close = () => { setShowForm(false); setForm(emptyForm()); setEditingId(null); setFormError(null); };
  const reloadExpenses = async () => {
    const list = await get<Expense[]>("/expense", { householdId: hid });
    setData((d) => d && { ...d, expenses: list });
    await summaryQ.reload();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || form.cost === "" || !form.date) {
      setFormError(`${t("expenses.form.name")}, ${t("expenses.form.cost")}, ${t("expenses.form.date")}`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: form.name, cost: Number(form.cost), date: form.date,
        ...(form.cropId !== undefined && { cropId: form.cropId }),
        ...(form.locationId !== undefined && { locationId: form.locationId }),
      };
      if (editingId !== null) await api("PUT", `/expense/${editingId}`, body);
      else await api("POST", "/expense", { ...body, householdId: hid });
      await reloadExpenses();
      close();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm(t("expenses.confirmDelete"))) return;
    await api("DELETE", `/expense/${id}`);
    setData((d) => d && { ...d, expenses: d.expenses.filter((x) => x.id !== id) });
    await summaryQ.reload();
  };

  const openEdit = (x: Expense) => {
    setEditingId(x.id);
    setForm({ name: x.name, cost: String(x.cost), date: x.date, cropId: x.cropId ?? undefined, locationId: x.locationId ?? undefined });
    setShowForm(true);
  };

  // Keep the selected year valid when the list loads.
  useEffect(() => { if (!years.includes(year)) setYear(years[0]); }, [years, year]);

  const tone = (n: number) => (n >= 0 ? "text-success" : "text-danger");

  return (
    <div>
      <PageTitle action={
        <Button data-testid="add-expense-btn" className="size-10 px-0" aria-label={t("expenses.addExpense")} onClick={() => { setForm(emptyForm()); setEditingId(null); setShowForm(true); }}><PlusIcon /></Button>
      }>{t("finances.title")}</PageTitle>

      <div data-testid="year-filter" className="mb-4 flex flex-wrap gap-2">
        {years.map((y) => <Chip key={y} on={year === y} onClick={() => setYear(y)}>{y}</Chip>)}
      </div>

      {summary && (
        <>
          <Card className="mb-4 space-y-2" data-testid="pl-summary">
            <p className="text-sm font-semibold">{t("finances.pl.title", { year })}</p>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Total label={t("finances.pl.spent")} testId="pl-spent">{formatKr(summary.totals.spent)}</Total>
              <Total label={t("finances.pl.realized")} testId="pl-realized" className="text-success">{formatKr(summary.totals.realized)}</Total>
              <Total label={t("finances.pl.forecast")} testId="pl-forecast" className="text-primary">{formatKr(summary.totals.forecast)}</Total>
              <Total label={t("finances.pl.net")} testId="pl-net" className={tone(summary.totals.net)}>{formatKr(summary.totals.net)}</Total>
            </div>
          </Card>
          <Card className="mb-6 px-0" data-testid="per-crop-card">
            <p className="mb-3 px-4 text-sm font-semibold">{t("finances.perCrop.title")}</p>
            {summary.perCrop.length === 0 ? (
              <p className="px-4 py-2 text-sm text-muted-foreground">{t("finances.perCrop.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">{t("finances.perCrop.cropCol")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("finances.perCrop.priceCol")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("finances.perCrop.spentCol")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("finances.perCrop.realizedCol")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("finances.perCrop.forecastCol")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("finances.perCrop.netCol")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.perCrop.map((row) => (
                      <tr key={row.cropId} data-testid="per-crop-row" className="border-b border-border last:border-b-0">
                        <td className="px-4 py-2 font-medium">{row.cropName}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.pricePerKg !== null ? row.pricePerKg : <Link to="/settings#crop-prices-heading" data-testid="set-price-link" className="text-xs text-primary hover:underline">{t("finances.perCrop.setPrice")}</Link>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatKr(row.spent)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.pricePerKg !== null ? formatKr(row.realized) : <span className="text-muted-foreground">{t("finances.perCrop.noPrice")}</span>}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.pricePerKg !== null ? formatKr(row.forecast) : <span className="text-muted-foreground">{t("finances.perCrop.noPrice")}</span>}</td>
                        <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", tone(row.net))}>{formatKr(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <SectionTitle>{t("finances.expensesSectionTitle")}</SectionTitle>
      <SearchInput className="mb-4" data-testid="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("expenses.filter.search")} />

      {loading && !data ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{filtered.length} {t("expenses.title").toLowerCase()}</p>
            <SortMenu label={t("expenses.sort.label")} value={sortKey} desc={sortDesc}
              options={[{ key: "date", label: t("expenses.sort.date") }, { key: "cost", label: t("expenses.sort.cost") }, { key: "name", label: t("expenses.sort.name") }]}
              onPick={(k) => { if (k === sortKey) setSortDesc(!sortDesc); else { setSortKey(k); setSortDesc(k !== "name"); } }} />
          </div>
          {filtered.length > 0 ? (
            <ul data-testid="expense-list" className="space-y-2">
              {filtered.map((x) => (
                <li key={x.id} data-testid="expense-item" className="flex items-center gap-3 rounded-lg border border-card-edge bg-card shadow-card px-4 py-3">
                  <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{x.date}</span>
                  <span className="flex-1 truncate text-sm">{x.name}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {name(data?.crops, x.cropId) && <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{name(data?.crops, x.cropId)}</span>}
                    {name(data?.locations, x.locationId) && <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{name(data?.locations, x.locationId)}</span>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{x.cost.toLocaleString("sv-SE")} kr</span>
                  <button type="button" className="shrink-0 text-xs text-muted-foreground hover:text-foreground" aria-label={t("expenses.edit")} onClick={() => openEdit(x)}>{t("expenses.edit")}</button>
                  <button type="button" className="shrink-0 text-xs text-danger hover:underline" aria-label={t("expenses.delete")} onClick={() => remove(x.id).catch(reportError)}>{t("expenses.delete")}</button>
                </li>
              ))}
            </ul>
          ) : <p className="py-8 text-center text-sm text-muted-foreground">{t("expenses.noExpenses")}</p>}
        </>
      )}

      <Dialog open={showForm} onClose={close} title={editingId !== null ? t("expenses.edit") : t("expenses.addExpense")}>
        <form data-testid="expense-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
          <FormRow label={t("expenses.form.name")}><Input value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormRow>
          <FormRow label={t("expenses.form.cost")}><Input type="number" min="0" step="0.01" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></FormRow>
          <FormRow label={t("expenses.form.date")}><Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></FormRow>
          <FormRow label={t("expenses.form.crop")}><Combobox value={form.cropId} options={data?.crops ?? []} placeholder={t("expenses.form.crop")} clearable onChange={(cropId) => setForm({ ...form, cropId })} /></FormRow>
          <FormRow label={t("expenses.form.location")}><Combobox value={form.locationId} options={data?.locations ?? []} placeholder={t("expenses.form.location")} clearable onChange={(locationId) => setForm({ ...form, locationId })} /></FormRow>
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>{t("locations.button.cancel")}</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? t("locations.button.saving") : editingId !== null ? t("expenses.edit") : t("expenses.addExpense")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Total({ label, testId, className, children }: { label: string; testId: string; className?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div data-testid={testId} className={cn("font-bold tabular-nums", className)}>{children}</div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}
