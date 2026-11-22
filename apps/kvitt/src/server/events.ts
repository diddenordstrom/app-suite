import type { ChangeEvent } from "../shared/api";

type Scope = ChangeEvent["scope"][number];
type Listener = (ev: ChangeEvent) => void;

/** In-process pub/sub per household. Single server process, so no broker needed. */
export class EventBus {
  private listeners = new Map<number, Set<Listener>>();

  subscribe(householdId: number, fn: Listener): () => void {
    let set = this.listeners.get(householdId);
    if (!set) this.listeners.set(householdId, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(householdId);
    };
  }

  emit(householdId: number, ...scope: Scope[]): void {
    const ev: ChangeEvent = { scope };
    for (const fn of this.listeners.get(householdId) ?? []) fn(ev);
  }

  listenerCount(householdId: number): number {
    return this.listeners.get(householdId)?.size ?? 0;
  }
}
