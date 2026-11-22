/** The trip plan on the client: fetching, the selected day, and formatting of estimates and dates. */
import { useCallback, useSyncExternalStore } from "react";
import type { PlanResponse } from "@/shared/api";
import { roundKm, roundMinutes } from "@/shared/geo";
import { todayIndex, type Plan } from "@/shared/plan";
import { useQuery } from "./api";
import { useTrip } from "./trip";
import { locale, t } from "./i18n";

export function usePlan() {
  const { base } = useTrip();
  return useQuery<PlanResponse>(`${base}/plan`);
}

// ---- selected day per trip (persisted) ----
const dayKey = (tid: number) => `et:day:${tid}`;
const dayListeners = new Set<() => void>();
const subscribeDay = (cb: () => void) => { dayListeners.add(cb); return () => { dayListeners.delete(cb); }; };
const readDay = (tid: number) => {
  try { return Number(localStorage.getItem(dayKey(tid))) || null; } catch { return null; }
};

/** The selected day: the stored one if it still exists, else today's, else the first. */
export function useCurrentDay(plan: Plan) {
  const { tid } = useTrip();
  const stored = useSyncExternalStore(subscribeDay, () => readDay(tid));
  const ti = todayIndex(plan);
  const idx = Math.max(0, plan.days.findIndex((d) => d.id === stored) >= 0 ? plan.days.findIndex((d) => d.id === stored) : ti >= 0 ? ti : 0);
  const select = useCallback((id: number) => {
    try { localStorage.setItem(dayKey(tid), String(id)); } catch { /* ignore */ }
    dayListeners.forEach((f) => f());
  }, [tid]);
  return { idx, select, todayIdx: ti };
}

// ---- formatting ----
export const fmtKm = (km: number) => t("est.km", { km: roundKm(km) });

export function fmtDuration(hours: number): string {
  const m = roundMinutes(hours), h = Math.floor(m / 60), mm = m % 60;
  const parts = [h ? t("est.h", { h }) : "", mm ? t("est.min", { m: mm }) : ""].filter(Boolean);
  return t("est.approx", { t: parts.join(" ") });
}

export const fmtDate = (d: Date) => d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
export const fmtShortDate = (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "short" });
