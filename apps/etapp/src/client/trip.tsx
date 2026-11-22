import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { ChangeEvent, Member, MeResponse, TripDetail } from "@/shared/api";
import { api, invalidateScopes, invalidateTrip, useQuery, type Scope } from "./api";

// ---- selected trip (persisted) ----
const TID_KEY = "et:tid";
const tidListeners = new Set<() => void>();
const readTid = () => {
  try { return Number(localStorage.getItem(TID_KEY)) || null; } catch { return null; }
};
export function selectTrip(id: number) {
  try { localStorage.setItem(TID_KEY, String(id)); } catch { /* ignore */ }
  tidListeners.forEach((f) => f());
}
const subscribeTid = (cb: () => void) => { tidListeners.add(cb); return () => { tidListeners.delete(cb); }; };

export const useMe = () => useQuery<MeResponse>("/me");

// ---- context ----
export interface TripCtx {
  tid: number;
  base: string; // "/t/:tid"
  meResponse: MeResponse;
  detail: TripDetail;
  me: Member;
  isAdmin: boolean;
  /** Active (non-removed) travellers. */
  members: Member[];
  name: (id: number) => string;
  /** Mutate under the trip base path, then refetch the given scopes. */
  call: <T = unknown>(method: "POST" | "PATCH" | "DELETE", sub: string, body?: unknown, scopes?: Scope[]) => Promise<T>;
}

const Ctx = createContext<TripCtx | null>(null);

export function useTrip(): TripCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTrip outside TripProvider");
  return c;
}

/** SSE: refetch scopes named by server change events; refetch everything after a reconnect. */
function useLiveUpdates(tid: number) {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/t/${tid}/events`);
    let opened = false;
    es.onopen = () => {
      if (opened) invalidateTrip(tid);
      opened = true;
    };
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(e.data) as ChangeEvent;
        if (Array.isArray(ev.scope)) invalidateScopes(tid, ev.scope);
      } catch { /* ignore keepalives / malformed */ }
    };
    return () => es.close();
  }, [tid]);
}

export function TripProvider({ me, loading, error, children }: { me: MeResponse; loading: ReactNode; error: (msg: string, retry: () => void) => ReactNode; children: ReactNode }) {
  const stored = useSyncExternalStore(subscribeTid, readTid);
  const tid = me.trips.find((x) => x.id === stored)?.id ?? me.trips[0].id;
  const base = `/t/${tid}`;
  const q = useQuery<TripDetail>(base);
  useLiveUpdates(tid);

  const call = useCallback(async <T,>(method: string, sub: string, body?: unknown, scopes?: Scope[]) => {
    const res = await api<T>(method, base + sub, body);
    if (scopes) invalidateScopes(tid, scopes);
    return res;
  }, [base, tid]);

  const value = useMemo<TripCtx | null>(() => {
    const detail = q.data;
    if (!detail || detail.id !== tid) return null;
    const byId = new Map(detail.members.map((m) => [m.id, m]));
    return {
      tid, base, meResponse: me, detail, me: detail.me,
      isAdmin: detail.me.role === "admin",
      members: detail.members.filter((m) => !m.removed),
      name: (id) => byId.get(id)?.name ?? "?",
      call,
    };
  }, [q.data, tid, base, me, call]);

  if (!value) {
    if (q.error) return <>{error(q.error.message, () => void q.refetch())}</>;
    return <>{loading}</>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
