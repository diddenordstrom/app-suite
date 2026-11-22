import { useMemo, useState } from "react";
import { Badge, Card } from "../ui";
import { get, useLoad } from "../api";
import { t, type MsgKey } from "../i18n";
import { Chip, EmptyState, PageTitle, SearchInput, Skeleton } from "../components/common";
import { SortMenu } from "../components/SortMenu";

interface Crop { id: number; name: string; yieldKgPerM2: number; kcalPerKg: number; proteinGPerKg: number; carbsGPerKg: number; fatGPerKg: number; category: string }

const CATEGORIES = ["root", "leafy", "legume", "fruit", "grain"] as const;
type SortKey = "name" | "kcalPerKg" | "proteinGPerKg" | "carbsGPerKg" | "fatGPerKg" | "yieldKgPerM2";
const SORT_OPTIONS: { key: SortKey; label: MsgKey }[] = [
  { key: "name", label: "crops.sort.name" },
  { key: "kcalPerKg", label: "crops.sort.kcal" },
  { key: "proteinGPerKg", label: "crops.sort.protein" },
  { key: "carbsGPerKg", label: "crops.sort.carbs" },
  { key: "fatGPerKg", label: "crops.sort.fat" },
  { key: "yieldKgPerM2", label: "crops.sort.yield" },
];

export function Crops() {
  const { data: crops, loading } = useLoad(() => get<Crop[]>("/crops"), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);

  const filtered = useMemo(() => {
    let list = crops ?? [];
    if (category) list = list.filter((c) => c.category === category);
    const q = query.toLowerCase().trim();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    const dir = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      return typeof av === "string" ? dir * av.localeCompare(bv as string) : dir * (av - (bv as number));
    });
  }, [crops, category, query, sortKey, sortDesc]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(key !== "name"); }
  };

  return (
    <div>
      <PageTitle>{t("crops.title")}</PageTitle>
      <SearchInput className="mb-4" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("crops.search.placeholder")} aria-label={t("crops.search.ariaLabel")} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t("crops.filter.ariaLabel")}>
        <Chip on={!category} onClick={() => setCategory(null)}>{t("crops.filter.all")}</Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} on={category === c} onClick={() => setCategory(category === c ? null : c)}>{t(`crops.category.${c}` as MsgKey)}</Chip>
        ))}
      </div>

      {loading && !crops ? (
        <div className="grid gap-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : crops && crops.length > 0 ? (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{t("crops.count", { count: filtered.length })}</p>
            <SortMenu label={t("crops.sort.label")} options={SORT_OPTIONS.map((o) => ({ key: o.key, label: t(o.label) }))} value={sortKey} desc={sortDesc} onPick={setSort} />
          </div>
          {filtered.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((crop) => (
                <Card key={crop.id} data-testid="crop-card">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{crop.name}</h2>
                    <Badge>{t(`crops.category.${crop.category}` as MsgKey)}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <Fact label={t("crops.table.yield")}>{crop.yieldKgPerM2} {t("crops.unit.kgPerM2")}</Fact>
                    <Fact label={t("crops.table.kcal")}>{crop.kcalPerKg} {t("crops.unit.kcalPerKg")}</Fact>
                    <Fact label={t("crops.table.protein")}>{crop.proteinGPerKg} {t("crops.unit.gPerKg")}</Fact>
                    <Fact label={t("crops.table.carbs")}>{crop.carbsGPerKg} {t("crops.unit.gPerKg")}</Fact>
                    <Fact label={t("crops.table.fat")}>{crop.fatGPerKg} {t("crops.unit.gPerKg")}</Fact>
                  </div>
                </Card>
              ))}
            </div>
          ) : <EmptyState title={t("crops.empty.title")} description={t("crops.empty.description")} />}
        </>
      ) : <EmptyState title={t("crops.empty.title")} description={t("crops.empty.description")} />}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}
