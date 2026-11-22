/**
 * Autarki's strings on top of the suite's shared ones (@homelab/i18n): see that package
 * for how language, interpolation and plurals work. Dictionaries per area export `en`
 * (source of truth for keys) and `sv` typed against it.
 */
import { createI18n } from "@homelab/i18n";
import * as core from "./core";
import * as places from "./places";
import * as plan from "./plan";
import * as plants from "./plants";

export { lang, locale, LANGS, setLang, type Lang } from "@homelab/i18n";

export const { t, tn } = createI18n({
  en: { ...core.en, ...plants.en, ...places.en, ...plan.en },
  sv: { ...core.sv, ...plants.sv, ...places.sv, ...plan.sv },
});
export type MsgKey = Parameters<typeof t>[0];
