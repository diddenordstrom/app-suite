import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, Input } from "../ui";
import { api, get, useLoad } from "../api";
import { t } from "../i18n";
import { reportError } from "../toast";
import { Combobox } from "../components/Combobox";
import { EmptyState, FormError, Label, PageTitle, PlusIcon, Skeleton } from "../components/common";

interface Crop { id: number; name: string }
interface SeedVariety { id: number; cropId: number; name: string; varietyType: string | null }

const emptyForm = { cropId: undefined as number | undefined, varietyType: "", name: "" };

export function Seeds() {
  const { data, loading, reload } = useLoad(async () => {
    const [crops, varieties] = await Promise.all([get<Crop[]>("/crops"), get<SeedVariety[]>("/seed-variety")]);
    return { crops, varieties };
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const crops = useMemo(() => data?.crops ?? [], [data]);
  const groups = useMemo(() => crops
    .map((crop) => ({ crop, varieties: (data?.varieties ?? []).filter((v) => v.cropId === crop.id) }))
    .filter((g) => g.varieties.length > 0), [crops, data]);
  const sortedCrops = useMemo(() => [...crops].sort((a, b) => a.name.localeCompare(b.name)), [crops]);

  const reset = () => { setForm(emptyForm); setEditingId(null); setError(null); };
  const openAdd = () => { reset(); setShowForm(true); };
  const openEdit = (v: SeedVariety) => {
    setEditingId(v.id);
    setForm({ cropId: v.cropId, varietyType: v.varietyType ?? "", name: v.name });
    setError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.cropId) return setError(t("seeds.errors.cropRequired"));
    if (!form.name.trim()) return setError(t("seeds.errors.nameRequired"));
    setSaving(true);
    try {
      const payload = { cropId: form.cropId, name: form.name.trim(), ...(form.varietyType.trim() && { varietyType: form.varietyType.trim() }) };
      if (editingId) await api("PUT", `/seed-variety/${editingId}`, payload);
      else await api("POST", "/seed-variety", payload);
      setShowForm(false);
      reset();
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm(t("seeds.confirm.delete"))) return;
    try {
      await api("DELETE", `/seed-variety/${id}`);
      await reload();
    } catch (err) { reportError(err); }
  };

  return (
    <div>
      <PageTitle action={!showForm && (
        <Button className="size-10 px-0" aria-label={t("seeds.addButton.ariaLabel")} onClick={openAdd}><PlusIcon /></Button>
      )}>{t("seeds.title")}</PageTitle>

      {loading && !data ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <>
          {showForm && (
            <Card className="mb-6" data-testid="seed-form">
              <form className="space-y-4" onSubmit={(e) => void save(e)}>
                <FormError>{error}</FormError>
                <div className="space-y-2">
                  <Label htmlFor="seedCropId">{t("seeds.form.crop.label")}</Label>
                  <Combobox value={form.cropId} options={sortedCrops} placeholder={t("seeds.form.crop.placeholder")} onChange={(cropId) => setForm({ ...form, cropId })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="varietyType">{t("seeds.form.type.label")}</Label>
                    <Input id="varietyType" value={form.varietyType} placeholder={t("seeds.form.type.placeholder")} onChange={(e) => setForm({ ...form, varietyType: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="varietyName">{t("seeds.form.name.label")}</Label>
                    <Input id="varietyName" value={form.name} placeholder={t("seeds.form.name.placeholder")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={saving}>
                    {saving ? t("common.saving") : editingId ? t("seeds.button.update") : t("seeds.button.add")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); reset(); }}>{t("seeds.button.cancel")}</Button>
                </div>
              </form>
            </Card>
          )}
          {groups.length > 0 ? (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.crop.id}>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.crop.name}</h2>
                  <Card className="p-0">
                    <ul className="divide-y divide-border">
                      {g.varieties.map((v) => (
                        <li key={v.id} data-testid="seed-variety-row" className="flex items-center justify-between gap-2 px-4 py-3">
                          <div>
                            <span className="font-medium">{v.name}</span>
                            {v.varietyType && <span className="ml-2 text-sm text-muted-foreground">{v.varietyType}</span>}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" className="h-8 px-3" onClick={() => openEdit(v)}>{t("seeds.button.edit")}</Button>
                            <Button variant="outline" className="h-8 px-3" onClick={() => void remove(v.id)}>{t("seeds.button.delete")}</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              ))}
            </div>
          ) : !showForm && <EmptyState title={t("seeds.empty.title")} description={t("seeds.empty.description")} />}
        </>
      )}
    </div>
  );
}
