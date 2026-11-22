import type { ChangeEvent } from "../shared/api";

type Scope = ChangeEvent["scope"][number];
type Listener = (ev: ChangeEvent) => void;

/** In-process pub/sub per trip. Single server process, so no broker needed. */
export class EventBus {
  private listeners = new Map<number, Set<Listener>>();

  subscribe(tripId: number, fn: Listener): () => void {
    let set = this.listeners.get(tripId);
    if (!set) this.listeners.set(tripId, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(tripId);
    };
  }

  emit(tripId: number, ...scope: Scope[]): void {
    const ev: ChangeEvent = { scope };
    for (const fn of this.listeners.get(tripId) ?? []) fn(ev);
  }

  listenerCount(tripId: number): number {
    return this.listeners.get(tripId)?.size ?? 0;
  }
}
