/**
 * Offline trip check-off (D11). Ops apply optimistically via an overlay, are queued in
 * localStorage per trip, and flushed to POST /h/:hid/trips/:id/ops when online.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { ItemStatus, TripOpsBody } from "@/shared/api";
import { api, ApiError, fetchQuery, invalidateScopes } from "./api";

type Op = TripOpsBody["ops"][number];
type Queue = Record<string, Op[]>; // key "hid:tripId"

const KEY = "ss:tripops";
const listeners = new Set<() => void>();

function load(): Queue {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Queue; } catch { return {}; }
}
let queue: Queue = load();

function save(next: Queue) {
  queue = next;
  try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch { /* ignore */ }
  listeners.forEach((f) => f());
}

export function queueOp(hid: number, tripId: number, op: Op) {
  const k = `${hid}:${tripId}`;
  const ops = (queue[k] ?? []).filter((o) => o.itemId !== op.itemId);
  save({ ...queue, [k]: [...ops, op] });
  void flushQueue();
}

function removeSent(k: string, sent: Op[]) {
  const left = (queue[k] ?? []).filter((o) => !sent.some((s) => s.itemId === o.itemId && s.status === o.status));
  const next = { ...queue };
  if (left.length) next[k] = left;
  else delete next[k];
  save(next);
}

let flushing = false;
let again = false;

export async function flushQueue(): Promise<void> {
  if (flushing) { again = true; return; }
  if (!navigator.onLine) return;
  flushing = true;
  try {
    for (const [k, ops] of Object.entries(queue)) {
      if (!ops.length) continue;
      const [hid, tripId] = k.split(":").map(Number);
      try {
        await api("POST", `/h/${hid}/trips/${tripId}/ops`, { ops } satisfies TripOpsBody);
      } catch (e) {
        // Network/server failure: keep and retry later. Client errors (trip closed, item gone): drop.
        if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) return;
      }
      // Refetch before dropping the overlay so the UI doesn't flicker back to the old state.
      invalidateScopes(hid, ["trips"]);
      await fetchQuery(`/h/${hid}/lists`);
      removeSent(k, ops);
    }
  } finally {
    flushing = false;
    if (again) { again = false; void flushQueue(); }
  }
}

export function initTripQueue() {
  window.addEventListener("online", () => void flushQueue());
  void flushQueue();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Pending (unsynced) item statuses for a household plus total pending op count. */
export function usePendingOps(hid: number) {
  const q = useSyncExternalStore(subscribe, () => queue);
  return useMemo(() => {
    const statuses = new Map<number, ItemStatus>();
    let count = 0;
    for (const [k, ops] of Object.entries(q)) {
      if (!k.startsWith(`${hid}:`)) continue;
      for (const o of ops) { statuses.set(o.itemId, o.status); count++; }
    }
    return { statuses, count };
  }, [q, hid]);
}
