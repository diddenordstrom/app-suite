/**
 * Etapp's strings on top of the suite's shared ones (@homelab/i18n): see that package
 * for how language, interpolation and plurals work. Dictionaries per area (core.ts,
 * plan.ts) export `en` (source of truth for keys) and `sv` typed against it.
 */
import { createI18n } from "@homelab/i18n";
import * as core from "./core";
import * as plan from "./plan";

export { lang, locale, LANGS, setLang, possessive, type Lang } from "@homelab/i18n";

export const { t, tn } = createI18n({
  en: { ...core.en, ...plan.en },
  sv: { ...core.sv, ...plan.sv },
});
export type MsgKey = Parameters<typeof t>[0];

/** Month name, 1–12. */
export const monthName = (m: number) => t("months").split(",")[m - 1] ?? String(m);
