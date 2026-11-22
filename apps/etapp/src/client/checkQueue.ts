/**
 * Offline check-off for todos and the packing list. A tick applies at once through an overlay, is queued in
 * localStorage per trip, and is sent as PATCH …/todos/:id or …/pack/:id when the device is online.
 * Other edits need a connection; ticking things off on a mountain pass should not.
 */
import { useMemo, useSyncExternalStore } from "react";
import { api, ApiError, fetchQuery, invalidateScopes } from "./api";

export interface CheckOp { kind: "todo" | "pack"; id: number; done: boolean }
type Queue = Record<string, CheckOp[]>; // key: trip id

const KEY = "et:checks";
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

const same = (a: CheckOp, b: CheckOp) => a.kind === b.kind && a.id === b.id;

/** Queue a tick; the latest state per item wins. */
export function queueCheck(tid: number, op: CheckOp) {
  const k = String(tid);
  save({ ...queue, [k]: [...(queue[k] ?? []).filter((o) => !same(o, op)), op] });
  void flushChecks();
}

function removeSent(k: string, sent: CheckOp[]) {
  const left = (queue[k] ?? []).filter((o) => !sent.some((s) => same(s, o) && s.done === o.done));
  const next = { ...queue };
  if (left.length) next[k] = left;
  else delete next[k];
  save(next);
}

let flushing = false;
let again = false;

export async function flushChecks(): Promise<void> {
  if (flushing) { again = true; return; }
  if (!navigator.onLine) return;
  flushing = true;
  try {
    for (const [k, ops] of Object.entries(queue)) {
      const tid = Number(k);
      const sent: CheckOp[] = [];
      for (const op of ops) {
        try {
          await api("PATCH", `/t/${tid}/${op.kind === "todo" ? "todos" : "pack"}/${op.id}`, { done: op.done });
        } catch (e) {
          // Offline or server trouble: keep the rest for later. Gone or forbidden: drop it.
          if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) break;
        }
        sent.push(op);
      }
      if (!sent.length) continue;
      // Refetch before dropping the overlay so a box doesn't flicker back.
      invalidateScopes(tid, ["plan"]);
      await fetchQuery(`/t/${tid}/plan`);
      removeSent(k, sent);
    }
  } finally {
    flushing = false;
    if (again) { again = false; void flushChecks(); }
  }
}

export function initCheckQueue() {
  window.addEventListener("online", () => void flushChecks());
  void flushChecks();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Unsynced ticks for a trip: `done(kind, id, server)` gives what to show, `count` how many are waiting. */
export function usePendingChecks(tid: number) {
  const q = useSyncExternalStore(subscribe, () => queue);
  return useMemo(() => {
    const ops = q[String(tid)] ?? [];
    const map = new Map(ops.map((o) => [`${o.kind}:${o.id}`, o.done]));
    return {
      count: ops.length,
      done: (kind: CheckOp["kind"], id: number, server: boolean) => map.get(`${kind}:${id}`) ?? server,
    };
  }, [q, tid]);
}
