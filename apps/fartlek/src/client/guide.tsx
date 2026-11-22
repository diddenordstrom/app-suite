import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TourProvider, useAutoTour, useTour, type Tour, type TourStep } from "./ui";
import { api } from "./http";
import { t } from "./i18n";
import type { GarminInfo } from "./types";

/** Which tours the user has seen live on the server, so they don't come back on a new phone. */
export function FartlekTours({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<string[] | null>(null);
  useEffect(() => {
    api<{ seen: string[] }>("/tours").then((r) => setSeen(r.seen)).catch(() => setSeen([]));
  }, []);
  const onSeen = useCallback((id: string) => {
    void api<{ seen: string[] }>(`/tours/${id}`, { method: "PUT" }).then((r) => setSeen(r.seen)).catch(() => {});
  }, []);
  return <TourProvider seen={seen} onSeen={onSeen}>{children}</TourProvider>;
}

const s = (target: string | undefined, key: string, extra: Partial<TourStep> = {}): TourStep => ({
  target, title: t(`tour.${key}Title` as never), body: t(`tour.${key}Body` as never), ...extra,
});

/**
 * The first-login tour: a few steps only, in page order. Without Garmin it walks the user to
 * Settings, waits for the key (GarminCard signals "garmin-connected") and shows the sync that then
 * starts by itself; those steps replace the tour of the week, since setting up comes first.
 */
export function onboardingTour({ needsGarmin }: { needsGarmin: boolean }): Tour {
  const home = { route: "/" };
  const steps: TourStep[] = [
    s(undefined, "welcome", home),
    s("home-form", "form", home),
    ...(needsGarmin
      ? [
          s("nav-settings", "settings", { advance: "click" }),
          s("settings-garmin", "key", { route: "/settings", advance: { signal: "garmin-connected" } }),
          s("settings-sync", "sync", { route: "/settings", optional: true }),
        ]
      : [s("home-week", "week", home), s("nav-plan", "plan")]),
  ];
  return { id: "onboarding", steps };
}

/** Trends, top to bottom: the four views most worth knowing (critical speed and HRV explain themselves with ⓘ). */
export const trendsTour = (): Tour => ({
  id: "trends",
  steps: [
    s("trends-km", "tKm", { route: "/trends" }),
    s("trends-load", "tLoad", { route: "/trends" }),
    s("trends-threshold", "tThreshold", { route: "/trends", optional: true }),
    s("trends-intensity", "tIntensity", { route: "/trends" }),
  ],
});

/** Starts the first-login tour once, for anyone who hasn't seen it. */
export function OnboardingAuto({ demo }: { demo: boolean }) {
  const { seen } = useTour();
  const [tour, setTour] = useState<Tour | null>(null);
  const pending = seen != null && !seen.includes("onboarding");
  useEffect(() => {
    if (!pending || tour) return;
    if (demo) { setTour(onboardingTour({ needsGarmin: false })); return; }
    api<GarminInfo>("/garmin")
      .then((g) => setTour(onboardingTour({ needsGarmin: !g.connected })))
      .catch(() => setTour(onboardingTour({ needsGarmin: false })));
  }, [pending, tour, demo]);
  useAutoTour(tour);
  return null;
}
