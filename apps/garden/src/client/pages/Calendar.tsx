import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Dialog, Input, Textarea, cn } from "../ui";
import { api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { t, type MsgKey } from "../i18n";
import { reportError } from "../toast";
import { Select } from "../components/Select";
import { ChipMultiSelect } from "../components/Combobox";
import { PageTitle, PlusIcon, Skeleton, TrashIcon } from "../components/common";
import { EVENT_TYPES, EVENT_TYPE_CHIP, type EventType, type TimelineItem } from "../lib/events";
import { presetToRRule, rruleToPreset, RECURRENCE_PRESETS, type RecurrencePreset } from "../lib/recurrence";
import { today } from "../lib/format";

interface Location { id: number; name: string }
interface Planting { id: number; cropId: number; locationId: number; plantedDate: string; status: string }
interface Crop { id: number; name: string }
type Item = TimelineItem & { locationIds: number[]; plantingIds: number[] };

const CHORES = EVENT_TYPES.filter((x): x is Exclude<EventType, "general"> => x !== "general");
type GroupKey = "past" | "today" | "thisWeek" | "soon" | "later";
const GROUP_ORDER: GroupKey[] = ["past", "today", "thisWeek", "soon", "later"];

function daysUntil(date: string): number {
  return Math.round((new Date(date).getTime() - new Date(today()).getTime()) / 86_400_000);
}
function groupOf(item: Item): GroupKey {
  const d = daysUntil(item.date);
  return d < 0 ? "past" : d === 0 ? "today" : d <= 7 ? "thisWeek" : d <= 30 ? "soon" : "later";
}

const emptyForm = {
  title: "", date: "", locationIds: [] as number[], plantingIds: [] as number[], eventType: "general" as EventType, description: "",
  recurrencePreset: "none" as RecurrencePreset, recurrenceInterval: "",
  /** The rule as loaded, kept on save when it doesn't match a preset ("custom"). */
  recurrenceRuleRaw: null as string | null,
};

export function Calendar() {
  const { current } = useHousehold();
  // Filters live in the URL (?type=watering&hide_completed=1) so a filtered view survives a reload.
  const [params, setParams] = useSearchParams();
  const [filterType, setFilterType] = useState<EventType | "all">((params.get("type") as EventType | null) ?? "all");
  const [hideCompleted, setHideCompleted] = useState(params.get("hide_completed") === "1");
  useEffect(() => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (filterType === "all") n.delete("type"); else n.set("type", filterType);
      if (hideCompleted) n.set("hide_completed", "1"); else n.delete("hide_completed");
      return n;
    }, { replace: true });
  }, [filterType, hideCompleted, setParams]);

  const loadTimeline = () => get<Item[]>("/timeline", { householdId: current.id });
  const { data, loading, setData } = useLoad(async () => {
    const [locations, plantings, crops, timeline] = await Promise.all([
      get<Location[]>("/location"), get<Planting[]>("/planting"), get<Crop[]>("/crops"), loadTimeline(),
    ]);
    return { locations, plantings, crops, timeline };
  }, [current.id]);
  const refresh = async () => {
    const timeline = await loadTimeline();
    setData((d) => d && { ...d, timeline });
  };

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locations = data?.locations ?? [];
  const plantings = data?.plantings ?? [];
  const crops = data?.crops ?? [];
  const timeline = data?.timeline ?? [];
  const cropOf = (p: Planting) => crops.find((c) => c.id === p.cropId)?.name;
  const plantingLabel = (p: Planting) => {
    const loc = locations.find((l) => l.id === p.locationId)?.name;
    const crop = cropOf(p) ?? `#${p.id}`;
    return loc ? `${crop} (${loc})` : crop;
  };
  const locationPill = (ids: number[]) => (ids.length === 0 ? null : ids.length === 1 ? locations.find((l) => l.id === ids[0])?.name ?? null : String(ids.length));
  const plantingPill = (ids: number[]) => {
    if (ids.length === 0) return null;
    if (ids.length > 1) return String(ids.length);
    const p = plantings.find((x) => x.id === ids[0]);
    return (p && cropOf(p)) ?? null;
  };

  const open = (next: typeof emptyForm, id: number | null = null) => {
    setForm(next);
    setEditingId(id);
    setFormError(null);
    setShowForm(true);
  };
  const close = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };
  const quickAdd = (type: EventType) => open({ ...emptyForm, eventType: type, title: t(`calendar.quickAdd.${type}` as MsgKey), date: today() });
  const edit = (item: Item) => {
    // Old rows may only have recurringDays; they round-trip through the picker as "every N days".
    const rule = item.recurrenceRule ?? (item.recurringDays ? `FREQ=DAILY;INTERVAL=${item.recurringDays}` : null);
    const matched = rruleToPreset(rule);
    open({
      ...emptyForm, title: item.title, date: item.date, locationIds: [...item.locationIds], plantingIds: [...item.plantingIds],
      eventType: (item.eventType as EventType | null) ?? "general",
      recurrencePreset: matched.preset, recurrenceInterval: matched.intervalDays ? String(matched.intervalDays) : "", recurrenceRuleRaw: rule,
    }, item.id);
    // The timeline has no description; read it from the event itself.
    get<{ description: string | null }>(`/garden-event/${item.id}`)
      .then((row) => setForm((f) => ({ ...f, description: row.description ?? "" })), () => undefined);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.date) return setFormError(t("calendar.errors.titleAndDateRequired"));
    setSaving(true);
    setFormError(null);
    try {
      const recurrenceRule = form.recurrencePreset === "custom" ? form.recurrenceRuleRaw : presetToRRule(form.recurrencePreset, Number(form.recurrenceInterval) || undefined);
      const body = { title: form.title, date: form.date, eventType: form.eventType, description: form.description || null, recurrenceRule, locationIds: form.locationIds, plantingIds: form.plantingIds };
      if (editingId !== null) await api("PUT", `/garden-event/${editingId}`, body);
      else await api("POST", "/garden-event", { ...body, householdId: current.id });
      close();
      await refresh();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };
  const complete = async (id: number) => { await api("POST", `/garden-event/${id}/complete`).catch(reportError); await refresh(); };
  const remove = async (id: number) => {
    if (!confirm(t("calendar.confirm.delete"))) return;
    await api("DELETE", `/garden-event/${id}`).catch(reportError);
    await refresh();
  };

  const filtered = timeline.filter((item) => {
    if (filterType !== "all" && (item.type !== "event" || item.eventType !== filterType)) return false;
    return !(hideCompleted && item.completedAt !== null);
  });
  const groups = Object.fromEntries(GROUP_ORDER.map((g) => [g, filtered.filter((i) => groupOf(i) === g)])) as Record<GroupKey, Item[]>;
  const typeOptions = EVENT_TYPES.map((x) => ({ value: x, label: t(`calendar.eventType.${x}` as MsgKey) }));
  const chip = "shrink-0 rounded px-1.5 py-0.5 text-xs";

  return (
    <div>
      <PageTitle className="mb-6" action={<Button className="size-10 px-0" aria-label={t("calendar.addEvent")} onClick={() => open(emptyForm)}><PlusIcon /></Button>}>
        {t("calendar.title")}
      </PageTitle>

      <div className="mb-6 flex flex-wrap gap-2" data-testid="quick-add-bar">
        {CHORES.map((type) => (
          <button key={type} type="button" data-testid={`quick-add-${type}`} aria-label={t(`calendar.quickAdd.${type}` as MsgKey)} onClick={() => quickAdd(type)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
            <span aria-hidden>{EVENT_TYPE_CHIP[type].emoji}</span><span>{t(`calendar.quickAdd.${type}` as MsgKey)}</span>
          </button>
        ))}
      </div>

      <div data-testid="filter-bar" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm">
        <div className="inline-flex items-center gap-2">
          <span className="text-muted-foreground">{t("calendar.filters.type")}</span>
          <Select data-testid="filter-type" triggerClassName="h-8 min-w-32 px-2" value={filterType} aria-label={t("calendar.filters.type")}
            options={[{ value: "all" as const, label: t("calendar.filters.allTypes") }, ...typeOptions]}
            onChange={setFilterType} />
        </div>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" data-testid="filter-hide-completed" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} className="size-4 accent-primary" />
          <span className="text-muted-foreground">{t("calendar.filters.hideCompleted")}</span>
        </label>
      </div>

      {loading && !data ? (
        [0, 1, 2].map((g) => (
          <div key={g} className="mb-6">
            <Skeleton className="mb-2 h-4 w-24" />
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          </div>
        ))
      ) : (
        <>
          {GROUP_ORDER.map((group) => groups[group].length > 0 && (
            <div key={group} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(`calendar.groups.${group}` as MsgKey)}</h2>
              <ul className="space-y-2">
                {groups[group].map((item) => {
                  const type = item.eventType && item.eventType !== "general" ? EVENT_TYPE_CHIP[item.eventType] : undefined;
                  const locPill = item.type === "event" ? locationPill(item.locationIds) : null;
                  const plantPill = item.type === "event" ? plantingPill(item.plantingIds) : null;
                  return (
                    <li key={`${item.type}-${item.id}`} data-testid="garden-event-card"
                      className={cn("rounded-lg border bg-card px-4 py-3",
                        group === "past" && item.completedAt !== null ? "border-success bg-success/10"
                        : group === "past" ? "border-danger/50 bg-danger/5" : "border-border")}>
                      <div className="flex items-center gap-3">
                        {item.type === "harvest" ? (
                          <>
                            <span className={cn(chip, "bg-warning/15")}>{t("calendar.harvest")}</span>
                            <Link to="/plantings" className="flex-1 truncate text-sm hover:underline">{item.title}</Link>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.date}</span>
                          </>
                        ) : (
                          <>
                            <input type="checkbox" checked={item.completedAt !== null} disabled={item.completedAt !== null} aria-label={t("calendar.completeEvent")}
                              onChange={() => void complete(item.id)} className="size-4 shrink-0 accent-primary" />
                            {item.suggestionType === "transplant" ? <span className={cn(chip, "bg-success/15")}>{t("calendar.transplantDue")}</span>
                              : item.suggestionType === "harden_off" ? <span className={cn(chip, "bg-chart-1/20")}>{t("calendar.hardenOff")}</span>
                              : type && (
                                <span data-testid={`event-type-chip-${item.eventType}`} className={cn(chip, "inline-flex items-center gap-1", type.className)}>
                                  <span aria-hidden>{type.emoji}</span><span className="hidden sm:inline">{t(`calendar.eventType.${item.eventType}` as MsgKey)}</span>
                                </span>
                              )}
                            <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.date}</span>
                            <button type="button" data-testid="edit-event" aria-label={t("calendar.editEvent")} onClick={() => edit(item)}
                              className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                            </button>
                            <button type="button" data-testid="delete-event" aria-label={t("calendar.deleteEvent")} onClick={() => void remove(item.id)}
                              className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-danger/10 hover:text-danger">
                              <TrashIcon />
                            </button>
                          </>
                        )}
                      </div>
                      {(locPill || plantPill) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-7">
                          {locPill && (
                            <button type="button" data-testid="event-location-pill" onClick={() => edit(item)} className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground hover:bg-accent">
                              📍{item.locationIds.length >= 2 ? <span data-testid="event-location-count">{locPill}</span> : locPill}
                            </button>
                          )}
                          {plantPill && (
                            <button type="button" data-testid="event-planting-pill" onClick={() => edit(item)} className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground hover:bg-accent">
                              🌱{item.plantingIds.length >= 2 ? <span data-testid="event-planting-count">{plantPill}</span> : plantPill}
                            </button>
                          )}
                        </div>
                      )}
                      {item.type === "event" && item.description && <p className="mt-2 whitespace-pre-line pl-7 text-xs text-muted-foreground">{item.description}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {timeline.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("calendar.noEvents")}</p>}
        </>
      )}

      <Dialog open={showForm} onClose={close} title={editingId !== null ? t("calendar.editEvent") : t("calendar.addEvent")}>
        <div data-testid="garden-event-form">
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <div>
              <label htmlFor="title" className="mb-1 block text-sm font-medium">{t("calendar.form.title")}</label>
              <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label htmlFor="date" className="mb-1 block text-sm font-medium">{t("calendar.form.date")}</label>
              <Input id="date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="eventType" className="mb-1 block text-sm font-medium">{t("calendar.eventType.label")}</label>
              <Select id="eventType" value={form.eventType} options={typeOptions} onChange={(v) => setForm({ ...form, eventType: v })} />
            </div>
            <div data-testid="event-locations-picker">
              <p className="mb-1 block text-sm font-medium">{t("calendar.form.location")}</p>
              <ChipMultiSelect value={form.locationIds} options={locations} placeholder={t("calendar.form.locationAddPlaceholder")} emoji="📍" onChange={(v) => setForm({ ...form, locationIds: v })} />
            </div>
            <div data-testid="event-plantings-picker">
              <p className="mb-1 block text-sm font-medium">{t("calendar.form.planting")}</p>
              <ChipMultiSelect value={form.plantingIds} options={plantings.map((p) => ({ id: p.id, name: plantingLabel(p) }))} placeholder={t("calendar.form.plantingAddPlaceholder")} emoji="🌱" onChange={(v) => setForm({ ...form, plantingIds: v })} />
            </div>
            <div>
              <label htmlFor="recurrencePreset" className="mb-1 block text-sm font-medium">{t("calendar.form.recurrence")}</label>
              <Select id="recurrencePreset" value={form.recurrencePreset} onChange={(v) => setForm({ ...form, recurrencePreset: v })}
                options={[
                  ...RECURRENCE_PRESETS.map((p) => ({ value: p, label: t(`calendar.recurrence.${p}` as MsgKey) })),
                  ...(form.recurrencePreset === "custom" ? [{ value: "custom" as const, label: t("calendar.recurrence.custom"), disabled: true }] : []),
                ]} />
              {form.recurrencePreset === "every_n_days" && (
                <Input type="number" min={2} className="mt-2" placeholder={t("calendar.recurrence.intervalPlaceholder")} value={form.recurrenceInterval} onChange={(e) => setForm({ ...form, recurrenceInterval: e.target.value })} />
              )}
            </div>
            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium">{t("calendar.form.description")}</label>
              <Textarea id="description" rows={2} className="resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={close}>{t("locations.button.cancel")}</Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? t("locations.button.saving") : editingId !== null ? t("calendar.saveEvent") : t("calendar.addEvent")}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}

