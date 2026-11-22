/**
 * Brygga's strings on top of the suite's shared ones (@homelab/i18n): see that package
 * for how language and interpolation work. `strings.ts` exports `en` (source of truth for keys)
 * and `sv` typed against it.
 */
import { createI18n } from "@homelab/i18n";
import * as strings from "./strings";

export { lang, LANGS, locale, setLang, type Lang } from "@homelab/i18n";

export const { t } = createI18n({ en: strings.en, sv: strings.sv });
export type MsgKey = Parameters<typeof t>[0];
