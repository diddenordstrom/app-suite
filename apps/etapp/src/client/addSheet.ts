/** Open/close state of the "Lägg till" sheet, shared by the tab bar button, the day timeline and the idea bank. */
import { useSyncExternalStore } from "react";

export type AddKind = "stop" | "via" | "night" | "idea";

let state: { open: boolean; kind: AddKind } = { open: false, kind: "stop" };
const listeners = new Set<() => void>();
const set = (next: typeof state) => { state = next; listeners.forEach((f) => f()); };

export const openAdd = (kind: AddKind = "stop") => set({ open: true, kind });
export const closeAdd = () => set({ ...state, open: false });
export const useAddSheet = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state);
