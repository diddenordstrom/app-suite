/**
 * kvitt's strings on top of the suite's shared ones (@homelab/i18n): see that package
 * for how language, interpolation and plurals work. Dictionaries per area (core.ts,
 * shopping.ts) export `en` (source of truth for keys) and `sv` typed against it.
 */
import { createI18n } from "@homelab/i18n";
import * as core from "./core";
import * as shopping from "./shopping";

export { lang, locale, LANGS, setLang, possessive, type Lang } from "@homelab/i18n";

export const { t, tn } = createI18n({
  en: { ...core.en, ...shopping.en },
  sv: { ...core.sv, ...shopping.sv },
});
export type MsgKey = Parameters<typeof t>[0];
