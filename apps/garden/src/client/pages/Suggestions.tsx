import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, cn } from "../ui";
import { api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { t, type MsgKey } from "../i18n";
import { reportError } from "../toast";
import { PageTitle, Pill, Skeleton } from "../components/common";

interface CropOption {
  suggestionId: number; cropId: number; cropName: string; cropFamily: string; sowDate: string;
  sowMethod: "indoor" | "direct" | "transplant"; estimatedYieldKg: number; reason: string;
  sourceSeedlingId?: number; sourceSeedlingPlantedDate?: string;
}
interface BedSuggestion {
  locationId: number; locationName: string; areaM2: number; type: "empty_bed" | "succession";
  bedFreesUp: string | null; currentCropName: string | null; crops: CropOption[];
}
interface BedSuggestionsResponse { suggestions: BedSuggestion[]; maxedOutFamilies: { family: string; wishlistCount: number }[] }

/** The server embeds this i18n key in some reasons; translate it here. */
const resolveReason = (reason: string) => reason.replace("frostGate.advice.requiresFiberduk", t("frostGate.advice.requiresFiberduk"));
const formatYield = (kg: number) => (kg % 1 === 0 ? String(kg) : kg.toFixed(1));
const SHOWN = 5;

export function Suggestions() {
  const { current } = useHousehold();
  const navigate = useNavigate();
  const { data, setData, loading, reload } = useLoad(() => get<BedSuggestionsResponse>("/suggestions/bed", { householdId: current.id }), [current.id]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [howItWorks, setHowItWorks] = useState(false);
  const beds = data?.suggestions ?? [];

  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const accept = async (bed: BedSuggestion, crop: CropOption) => {
    if (crop.sowMethod === "transplant") {
      // The server moves the seedling planting in place; just refresh.
      await api("POST", `/garden-event/${crop.suggestionId}/accept`);
      await reload();
      return;
    }
    navigate(`/plantings?cropId=${crop.cropId}&locationId=${bed.locationId}&suggestionId=${crop.suggestionId}`);
  };

  const dismiss = async (crop: CropOption) => {
    await api("POST", `/garden-event/${crop.suggestionId}/dismiss`);
    setData((d) => d && {
      ...d,
      suggestions: d.suggestions
        .map((b) => ({ ...b, crops: b.crops.filter((c) => c.suggestionId !== crop.suggestionId) }))
        .filter((b) => b.crops.length > 0),
    });
  };

  const clearDismissals = async () => {
    if (!confirm(t("suggestions.clearDismissalsConfirm"))) return;
    await api("DELETE", "/suggestions/dismissals", undefined, { householdId: current.id });
    await reload();
  };

  return (
    <div>
      <PageTitle action={<Button variant="outline" className="h-9 px-3" data-testid="clear-dismissals-btn" onClick={() => clearDismissals().catch(reportError)}>{t("suggestions.clearDismissals")}</Button>}>
        {t("suggestions.pageTitle")}
      </PageTitle>

      <div className="mb-6">
        <button type="button" data-testid="how-it-works-toggle" aria-expanded={howItWorks} onClick={() => setHowItWorks(!howItWorks)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <svg className={cn("size-4 transition-transform", howItWorks && "rotate-90")} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          {t("suggestions.howItWorks.title")}
        </button>
        {howItWorks && <p data-testid="how-it-works-body" className="mt-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">{t("suggestions.howItWorks.body")}</p>}
      </div>

      {loading && !data ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : beds.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground" data-testid="suggestions-empty">{t("suggestions.empty")}</p>
      ) : (
        <>
          {data!.maxedOutFamilies.length > 0 && (
            <div className="mb-6 space-y-2">
              {data!.maxedOutFamilies.map((hint) => (
                <div key={hint.family} data-testid="maxed-out-family-banner" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  {t("suggestions.maxedOutFamily", { family: hint.family })}
                </div>
              ))}
            </div>
          )}
          <div className="space-y-4">
            {beds.map((bed) => {
              const open = expanded.has(bed.locationId);
              return (
                <Card key={bed.locationId} data-testid="bed-card">
                  <div className="mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{bed.locationName}</h2>
                      <Pill>{t("suggestions.areaLabel", { area: bed.areaM2 })}</Pill>
                      {bed.type === "empty_bed"
                        ? <Pill className="bg-signature-soft text-signature-foreground" data-testid="empty-bed-badge">{t("suggestions.emptyBedBadge")}</Pill>
                        : <Pill className="bg-warning/15 text-warning" data-testid="succession-badge">{t("suggestions.successionBadge")}</Pill>}
                    </div>
                    {bed.currentCropName && <p className="mt-1 text-xs text-muted-foreground">{t("suggestions.currentCrop", { crop: bed.currentCropName })}</p>}
                    {bed.bedFreesUp && <p className="text-xs text-muted-foreground">{t("suggestions.freesUp", { date: bed.bedFreesUp })}</p>}
                  </div>
                  <ul className="space-y-3">
                    {(open ? bed.crops : bed.crops.slice(0, SHOWN)).map((crop) => {
                      const transplant = crop.sowMethod === "transplant";
                      return (
                        <li key={crop.suggestionId} data-testid={transplant ? "transplant-option" : "crop-option"}
                          className={cn("flex items-start gap-3 rounded-lg border p-3", transplant ? "border-success/40 bg-success/5" : "border-border")}>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{crop.cropName}</p>
                              <Pill className="px-1.5 text-[10px]">{crop.cropFamily}</Pill>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              {transplant
                                ? <Pill className="bg-success/15 text-[10px] text-success">{t("suggestions.sowMethod.transplant")}</Pill>
                                : <span>{t(`suggestions.sowMethod.${crop.sowMethod}` as MsgKey)}</span>}
                              <span className="tabular-nums">{transplant ? t("suggestions.transplantDate", { date: crop.sowDate }) : t("suggestions.sowDate", { date: crop.sowDate })}</span>
                              <span className="tabular-nums">{t("suggestions.estimatedYield", { kg: formatYield(crop.estimatedYieldKg) })}</span>
                            </div>
                            {transplant && crop.sourceSeedlingPlantedDate && (
                              <p data-testid="transplant-source-label" className="mt-1 text-xs tabular-nums text-success">{t("suggestions.transplantSourceLabel", { date: crop.sourceSeedlingPlantedDate })}</p>
                            )}
                            <p className="mt-1 text-xs italic text-muted-foreground">{resolveReason(crop.reason)}</p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button variant="outline" className="h-7 px-2 text-xs" data-testid="accept-btn" onClick={() => accept(bed, crop).catch(reportError)}>{t("suggestions.accept")}</Button>
                            <Button variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" data-testid="dismiss-btn" onClick={() => dismiss(crop).catch(reportError)}>{t("suggestions.dismiss")}</Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {bed.crops.length > SHOWN && (
                    <button type="button" data-testid="show-more-btn" className="mt-3 text-xs text-primary hover:underline" onClick={() => toggle(bed.locationId)}>
                      {open ? t("suggestions.showLess") : t("suggestions.showMore", { count: bed.crops.length - SHOWN })}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
