/**
 * Tiny shared i18n. Swedish is the default; English is optional (Settings → Language).
 * The language is read once at startup; changing it stores the choice and reloads,
 * so `t()` is a plain function usable anywhere (components, helpers, formatters).
 *
 * Strings every app needs (buttons, errors, auth, settings, theme) live in ./shared.ts.
 * Each app calls `createI18n` with its own dictionaries; an app key with the same name
 * as a shared key overrides it (e.g. a domain-specific wording).
 *
 * Interpolation: "Hej {name}" + t("key", { name }). Plurals: keys `foo_one` / `foo_other`,
 * used via tn("foo", count, params) — `{count}` is available in both.
 */
import * as shared from "./shared";

export type Lang = "sv" | "en";
export const LANGS: { value: Lang; label: string }[] = [{ value: "sv", label: "Svenska" }, { value: "en", label: "English" }];

const KEY = "lang";
/** Per-app keys from before the shared package; read once so nobody loses their choice. */
const LEGACY_KEYS = ["ss:lang", "et:lang"];
const isLang = (v: unknown): v is Lang => v === "sv" || v === "en";

function readLang(): Lang {
  try {
    for (const k of [KEY, ...LEGACY_KEYS]) {
      const v = localStorage.getItem(k);
      if (isLang(v)) return v;
    }
  } catch { /* storage blocked or no DOM (tests, server) */ }
  return "sv";
}

export const lang: Lang = readLang();
/** BCP 47 locale for Intl/toLocale* calls. */
export const locale = lang === "sv" ? "sv-SE" : "en-GB";
if (typeof document !== "undefined") document.documentElement.lang = lang;

export function setLang(next: Lang) {
  if (next === lang) return;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  location.reload();
}

/** Possessive form of a name: sv "Annas"/"Lars" (no extra s after s/x/z), en "Anna's". */
export function possessive(name: string): string {
  if (lang === "sv") return /[sxz]$/i.test(name) ? name : `${name}s`;
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export type Params = Record<string, string | number>;
const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : s);

export type SharedKey = keyof typeof shared.en;
type PluralBases<K> = K extends `${infer B}_one` ? B : never;
type Dicts<E> = { en: E; sv: Record<keyof E, string> };

function make<K extends string>(sv: Record<string, string>, en: Record<string, string>) {
  const dict = lang === "sv" ? sv : en;
  const t = (key: K, params?: Params): string => fill(dict[key] ?? en[key] ?? key, params);
  const tn = (base: PluralBases<K>, count: number, params?: Params): string =>
    t(`${base}_${count === 1 ? "one" : "other"}` as K, { count, ...params });
  return { t, tn };
}

/** Shared strings only; for packages (like @homelab/ui) that have no app dictionary. */
export const { t: tShared, tn: tnShared } = make<SharedKey>(shared.sv, shared.en);

/** Build an app's t()/tn(): shared strings plus the app's own (app wins on a clash). */
export function createI18n<E extends Record<string, string>>(app: Dicts<E>) {
  type Key = SharedKey | Extract<keyof E, string>;
  return make<Key>({ ...shared.sv, ...app.sv }, { ...shared.en, ...app.en });
}
