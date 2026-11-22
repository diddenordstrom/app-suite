/**
 * The scenario lives only in this browser's localStorage, versioned (v: 1). Every access is
 * wrapped: private windows and blocked storage just mean nothing is remembered.
 */
import { defaultScenario, parseScenario, type Scenario } from "@/shared/scenario";

const KEY = "brygga:scenario";

export function storageWorks(): boolean {
  try {
    localStorage.setItem(`${KEY}:probe`, "1");
    localStorage.removeItem(`${KEY}:probe`);
    return true;
  } catch {
    return false;
  }
}

export function loadScenario(): Scenario {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseScenario(JSON.parse(raw)) ?? defaultScenario();
  } catch { /* blocked or corrupt: start from the example */ }
  return defaultScenario();
}

export function saveScenario(s: Scenario) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Hands the visitor the scenario as a JSON file. */
export function exportScenario(s: Scenario) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `brygga-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads an exported file back; null if it is not a Brygga scenario. */
export async function importScenario(file: File): Promise<Scenario | null> {
  try {
    return parseScenario(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
