import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { ChangeEvent, HouseholdDetail, Member, MeResponse } from "@/shared/api";
import { formatAmount } from "@/shared/balances";
import { t } from "./i18n";
import { api, invalidateHousehold, invalidateScopes, useQuery, type Scope } from "./api";

// ---- selected household (persisted) ----
const HID_KEY = "ss:hid";
const hidListeners = new Set<() => void>();
const readHid = () => {
  try { return Number(localStorage.getItem(HID_KEY)) || null; } catch { return null; }
};
export function selectHousehold(id: number) {
  try { localStorage.setItem(HID_KEY, String(id)); } catch { /* ignore */ }
  hidListeners.forEach((f) => f());
}
const subscribeHid = (cb: () => void) => { hidListeners.add(cb); return () => { hidListeners.delete(cb); }; };

export const useMe = () => useQuery<MeResponse>("/me");

// ---- context ----
export interface HouseholdCtx {
  hid: number;
  base: string; // "/h/:hid"
  meResponse: MeResponse;
  detail: HouseholdDetail;
  me: Member;
  isAdmin: boolean;
  /** Active (non-removed) members. */
  members: Member[];
  member: (id: number) => Member | undefined;
  name: (id: number) => string;
  /** Plånbok: the lead member whose wallet `id` shares (itself when on its own). Balances only use leads. */
  walletOf: (id: number) => number;
  /** A wallet's name for balances, "Didde & Sambon"; just the name for someone on their own. */
  walletName: (id: number) => string;
  /** The viewer's wallet lead (the id balances and settling use for "me"). */
  myWallet: number;
  currency: string;
  fmt: (minor: number) => string;
  /** Mutate under the household base path, then refetch the given scopes. */
  call: <T = unknown>(method: "POST" | "PATCH" | "DELETE", sub: string, body?: unknown, scopes?: Scope[]) => Promise<T>;
}

const Ctx = createContext<HouseholdCtx | null>(null);

export function useHousehold(): HouseholdCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHousehold outside HouseholdProvider");
  return c;
}

/** SSE: refetch scopes named by server change events; refetch everything after a reconnect. */
function useLiveUpdates(hid: number) {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/h/${hid}/events`);
    let opened = false;
    es.onopen = () => {
      if (opened) invalidateHousehold(hid);
      opened = true;
    };
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(e.data) as ChangeEvent;
        if (Array.isArray(ev.scope)) invalidateScopes(hid, ev.scope);
      } catch { /* ignore keepalives / malformed */ }
    };
    return () => es.close();
  }, [hid]);
}

export function HouseholdProvider({ me, loading, error, children }: { me: MeResponse; loading: ReactNode; error: (msg: string, retry: () => void) => ReactNode; children: ReactNode }) {
  const stored = useSyncExternalStore(subscribeHid, readHid);
  const hid = me.households.find((h) => h.id === stored)?.id ?? me.households[0].id;
  const base = `/h/${hid}`;
  const q = useQuery<HouseholdDetail>(base);
  useLiveUpdates(hid);

  const call = useCallback(async <T,>(method: string, sub: string, body?: unknown, scopes?: Scope[]) => {
    const res = await api<T>(method, base + sub, body);
    if (scopes) invalidateScopes(hid, scopes);
    return res;
  }, [base, hid]);

  const value = useMemo<HouseholdCtx | null>(() => {
    const detail = q.data;
    if (!detail || detail.id !== hid) return null;
    const byId = new Map(detail.members.map((m) => [m.id, m]));
    const currency = detail.currency || "SEK";
    const name = (id: number) => byId.get(id)?.name ?? t("common.someone");
    const walletOf = (id: number) => byId.get(id)?.walletId ?? id;
    const walletName = (id: number) => {
      const followers = detail.members.filter((m) => m.walletId === id && !m.removed);
      return [name(id), ...followers.map((m) => m.name)].join(" & ");
    };
    return {
      hid, base, meResponse: me, detail, me: detail.me,
      isAdmin: detail.me.role === "admin",
      members: detail.members.filter((m) => !m.removed),
      member: (id) => byId.get(id),
      name, walletOf, walletName, myWallet: walletOf(detail.me.id),
      currency,
      fmt: (minor) => formatAmount(minor, currency),
      call,
    };
  }, [q.data, hid, base, me, call]);

  if (!value) {
    if (q.error) return <>{error(q.error.message, () => void q.refetch())}</>;
    return <>{loading}</>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
