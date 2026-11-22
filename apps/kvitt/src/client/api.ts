/**
 * Data layer: fetch wrapper + a tiny query cache keyed by API path.
 * The last good response per path is persisted to localStorage so screens render offline.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { ChangeEvent } from "@/shared/api";
import { t, type MsgKey } from "./i18n";

export type Scope = ChangeEvent["scope"][number];

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Known server 409 messages → translated text. */
const CONFLICTS: Record<string, MsgKey> = {
  "a list is already in an active trip": "error.listInActiveTrip",
  "trip is not active": "error.tripNotActive",
};

/** User-facing message for a failed response: generic statuses are translated; 400/409 keep the server's specific text. */
function failureMessage(status: number, serverMsg: string | undefined): string {
  if (status === 401) return t("error.unauthorized");
  if (status === 403) return t("error.forbidden");
  if (status === 404) return t("error.notFound");
  if (status === 409 && serverMsg && CONFLICTS[serverMsg]) return t(CONFLICTS[serverMsg]);
  if (status >= 500) return t("error.server");
  return serverMsg ?? t("error.requestFailed", { status });
}

/** Call /api{path}. Throws ApiError with a user-facing message (status 0 = network failure). */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  // Every non-GET carries a JSON content-type (the server's CSRF check requires it), even without a body.
  const write = method !== "GET" && method !== "HEAD";
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: write ? { "content-type": "application/json" } : undefined,
      body: write ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError(t("error.network"), 0);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!res.ok) {
    const msg = (data as { error?: unknown } | null)?.error;
    throw new ApiError(failureMessage(res.status, typeof msg === "string" ? msg : undefined), res.status);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---- query cache ----

export interface QueryState<T> { data: T | undefined; error: ApiError | null; fetching: boolean }

/**
 * Persisted responses are only valid for the response shapes of the build that wrote them, so the prefix carries
 * a version: bump CACHE_VERSION whenever a cached response changes shape (v2: balances plan, household settings),
 * and older entries are dropped on load. Otherwise a new client renders an old response before the refetch lands.
 */
const CACHE_VERSION = 2;
const LS_ROOT = "ss:q";
const LS_PREFIX = `${LS_ROOT}${CACHE_VERSION}:`;
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith(LS_ROOT) && !k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
} catch { /* storage unavailable */ }
const store = new Map<string, QueryState<unknown>>();
const subs = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<void>>();
const rerun = new Set<string>();
const fetched = new Set<string>(); // fetched at least once this session (and not invalidated since)
const EMPTY: QueryState<unknown> = { data: undefined, error: null, fetching: false };

function read(path: string): QueryState<unknown> {
  let s = store.get(path);
  if (!s) {
    let data: unknown;
    try {
      const raw = localStorage.getItem(LS_PREFIX + path);
      if (raw) data = JSON.parse(raw);
    } catch { /* ignore */ }
    s = { data, error: null, fetching: false };
    store.set(path, s);
  }
  return s;
}

function write(path: string, patch: Partial<QueryState<unknown>>) {
  store.set(path, { ...read(path), ...patch });
  subs.get(path)?.forEach((f) => f());
}

/** Fetch (or refetch) a path into the cache. Concurrent calls coalesce; a call during a fetch schedules one more. */
export function fetchQuery(path: string): Promise<void> {
  const running = inflight.get(path);
  if (running) {
    rerun.add(path);
    return running;
  }
  fetched.add(path);
  write(path, { fetching: true });
  const p = api<unknown>("GET", path)
    .then(
      (data) => {
        write(path, { data, error: null, fetching: false });
        try { localStorage.setItem(LS_PREFIX + path, JSON.stringify(data)); } catch { /* quota */ }
      },
      (e: unknown) => write(path, { error: e instanceof ApiError ? e : new ApiError(errorMessage(e), 0), fetching: false }),
    )
    .finally(() => {
      inflight.delete(path);
      if (rerun.delete(path)) void fetchQuery(path);
    });
  inflight.set(path, p);
  return p;
}

/** Refetch mounted queries matching `pred`; unmounted ones refetch on next mount. */
export function invalidate(pred: (path: string) => boolean) {
  for (const path of [...store.keys()]) {
    if (!pred(path)) continue;
    if (subs.get(path)?.size) void fetchQuery(path);
    else fetched.delete(path);
  }
}

/** Map server change scopes to cached paths of household `hid`. */
export function invalidateScopes(hid: number, scopes: Scope[]) {
  const base = `/h/${hid}`;
  const has = (s: Scope) => scopes.includes(s);
  invalidate((path) => {
    if (path === "/me") return has("household");
    if (path !== base && !path.startsWith(base + "/")) return false;
    const seg = path.slice(base.length).split("/")[1] ?? "";
    if (seg === "") return has("household");
    if (seg === "activity") return has("trips") || has("expenses") || has("balances");
    if (seg === "stats") return has("trips") || has("expenses");
    if (seg === "settlements") return has("balances");
    if (seg === "items") return has("lists"); // items/suggestions
    if (seg === "car") return has("expenses"); // car calculator prefill
    return has(seg as Scope);
  });
}

export function invalidateHousehold(hid: number) {
  invalidateScopes(hid, ["household", "lists", "trips", "expenses", "balances"]);
}

/** Drop all cached responses (on sign-out). */
export function clearCache() {
  store.clear();
  fetched.clear();
  for (const k of Object.keys(localStorage)) if (k.startsWith(LS_ROOT)) localStorage.removeItem(k);
}

/** Subscribe to a GET path. `path = null` disables. Fetches on first mount per session and on invalidation. */
export function useQuery<T>(path: string | null) {
  const subscribe = useCallback((cb: () => void) => {
    if (!path) return () => {};
    let set = subs.get(path);
    if (!set) subs.set(path, (set = new Set()));
    set.add(cb);
    if (!fetched.has(path)) void fetchQuery(path);
    return () => { set.delete(cb); };
  }, [path]);
  const snap = useSyncExternalStore(subscribe, () => (path ? read(path) : EMPTY)) as QueryState<T>;
  const refetch = useCallback(() => (path ? fetchQuery(path) : Promise.resolve()), [path]);
  return { ...snap, loading: snap.data === undefined && !snap.error, refetch };
}
