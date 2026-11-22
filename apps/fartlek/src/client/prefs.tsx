import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./http";
import { DEFAULT_SETTINGS, type Settings } from "@/shared/types";
import { distUnit, fmtDist, fmtNum, fmtPace, fromUserDist, toUserDist } from "@/shared/format";
import { locale } from "./i18n";

interface Ctx { settings: Settings; setSettings: (s: Settings) => void; loaded: boolean }
const SettingsCtx = createContext<Ctx>({ settings: DEFAULT_SETTINGS, setSettings: () => {}, loaded: false });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Settings>("/settings").then((s) => { setSettings(s); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  return <SettingsCtx.Provider value={{ settings, setSettings, loaded }}>{children}</SettingsCtx.Provider>;
}

export const useSettings = () => useContext(SettingsCtx);

/** Formatters bound to the user's units. */
export function useFmt() {
  const { settings } = useSettings();
  const u = settings.units;
  return useMemo(() => ({
    units: u,
    unit: distUnit(u),
    dist: (km: number | null | undefined, digits = 1) => fmtDist(km, u, digits, locale),
    /** The distance as a number in the user's unit, to 0.1 (for inputs and charts). */
    distNum: (km: number) => Math.round(toUserDist(km, u) * 10) / 10,
    /** The same rounded distance as text, with the language's decimal mark (`12,4` in Swedish). */
    num: (km: number) => fmtNum(Math.round(toUserDist(km, u) * 10) / 10, 0, 1, locale),
    fromUser: (v: number) => fromUserDist(v, u),
    pace: (s: number | null | undefined) => fmtPace(s, u),
  }), [u]);
}
