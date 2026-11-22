import { useState } from "react";
import { tShared } from "@homelab/i18n";
import { SegmentedControl } from "./forms";

/**
 * Light / dark / follow-the-OS. The choice is stored per device and applied as
 * `data-theme` on <html>; tokens.css reads it (see the selectors there). "system" removes
 * the attribute so `prefers-color-scheme` decides. Each app's index.html runs a tiny inline
 * script that sets the attribute before first paint, so there's no flash of the wrong theme.
 */
export type ThemeMode = "system" | "light" | "dark";
const KEY = "theme";

export function getTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch { /* storage blocked */ }
  return "system";
}

/** Point the browser chrome (status bar on phones) at the page background. */
function syncThemeColor(mode: ThemeMode) {
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.dataset.media ??= m.media;
    m.dataset.content ??= m.content;
    if (mode === "system") { m.media = m.dataset.media; m.content = m.dataset.content; continue; }
    const want = `(prefers-color-scheme: ${mode})`;
    m.media = "";
    m.content = m.dataset.media === want ? m.dataset.content : getComputedStyle(document.body).backgroundColor;
  }
}

export function setTheme(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch { /* ignore */ }
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  syncThemeColor(mode);
}

/** Call once at startup (main.tsx) to align the browser chrome with a stored choice. */
export function initTheme() {
  if (typeof document !== "undefined") syncThemeColor(getTheme());
}

/** Labelled picker for a settings page. Not a <Field>: a wrapping <label> would click the first option. */
export function ThemeField() {
  return (
    <div className="space-y-1">
      <span className="block text-sm font-medium">{tShared("settings.theme")}</span>
      <ThemePicker className="flex w-full" />
    </div>
  );
}

export function ThemePicker({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(getTheme);
  return (
    <SegmentedControl<ThemeMode> className={className} value={mode} aria-label={tShared("settings.theme")}
      onChange={(m) => { setTheme(m); setMode(m); }}
      options={[
        { value: "system", label: tShared("theme.system") },
        { value: "light", label: tShared("theme.light") },
        { value: "dark", label: tShared("theme.dark") },
      ]} />
  );
}
