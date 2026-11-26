/**
 * fartlek's strings on top of the suite's shared ones (@homelab/i18n): see that package
 * for how language, interpolation and plurals work. Dictionaries per area export `en`
 * (source of truth for keys) and `sv` typed against it.
 *
 * Shared logic (src/shared) returns `Msg` objects (key + params) instead of text, so it
 * stays language-free and testable; `tm()` renders one.
 */
import { createI18n, locale } from "@homelab/i18n";
import type { Msg } from "@/shared/types";
import * as core from "./core";
import * as plan from "./plan";
import * as activity from "./activity";
import * as settings from "./settings";
import * as tour from "./tour";
import * as nextweek from "./nextweek";
import * as blockplan from "./blockplan";
import * as builder from "./builder";
import * as samesession from "./samesession";
import * as raceresults from "./raceresults";
import * as devsettings from "./devsettings";
import * as weekreview from "./weekreview";
import * as gym from "./gym";
import * as stats from "./stats";

export { lang, locale, LANGS, setLang, type Lang } from "@homelab/i18n";

export const { t, tn } = createI18n({
  en: { ...core.en, ...plan.en, ...activity.en, ...settings.en, ...tour.en, ...nextweek.en, ...blockplan.en, ...builder.en, ...samesession.en, ...raceresults.en, ...devsettings.en, ...weekreview.en, ...gym.en, ...stats.en },
  sv: { ...core.sv, ...plan.sv, ...activity.sv, ...settings.sv, ...tour.sv, ...nextweek.sv, ...blockplan.sv, ...builder.sv, ...samesession.sv, ...raceresults.sv, ...devsettings.sv, ...weekreview.sv, ...gym.sv, ...stats.sv },
});
export type MsgKey = Parameters<typeof t>[0];

/** Render a message from shared code. Uses the plural form when it has a `count` and a `_one` key. */
export function tm(m: Msg): string {
  const p = m.params;
  if (p && typeof p.count === "number") {
    const one = `${m.key}_one` as MsgKey;
    if (t(one) !== one) return t(`${m.key}_${p.count === 1 ? "one" : "other"}` as MsgKey, p);
  }
  return t(m.key as MsgKey, p);
}

/** Short weekday names indexed like Date.getDay() (0 = Sunday), in the current language. */
export const WEEKDAY_SHORT = Array.from({ length: 7 }, (_, d) =>
  new Date(Date.UTC(2023, 0, 1 + d)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }));
/** Full weekday names, indexed the same way. */
export const WEEKDAY_LONG = Array.from({ length: 7 }, (_, d) =>
  new Date(Date.UTC(2023, 0, 1 + d)).toLocaleDateString(locale, { weekday: "long", timeZone: "UTC" }));
