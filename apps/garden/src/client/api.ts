/**
 * Data layer: a fetch wrapper for /api and a small hook that loads data on mount.
 * Every page loads what it needs for the active household when it mounts.
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { t } from "./i18n";
import { showError } from "./toast";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** User-facing message for a failed response: generic statuses are translated; 4xx keep the server's text. */
function failureMessage(status: number, serverMsg: string | undefined): string {
  if (status === 401) return t("error.unauthorized");
  if (status === 403) return serverMsg ?? t("error.forbidden");
  if (status >= 500) return t("error.server");
  return serverMsg ?? t("error.requestFailed", { status });
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

/** "/api" + path + query string (null/undefined values are left out, arrays repeat the key). */
export function apiUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === null || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) qs.append(k, String(one));
  }
  const s = qs.toString();
  return `/api${path}${s ? (path.includes("?") ? "&" : "?") + s : ""}`;
}

/** Call /api{path}. JSON in and out; a FormData body is sent as is. Throws ApiError (status 0 = network failure). */
export async function api<T = unknown>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const write = method !== "GET" && method !== "HEAD";
  const form = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(apiUrl(path, query), {
      method,
      credentials: "same-origin",
      // Every write carries a JSON content-type (the server's CSRF check wants it) unless it's a file upload.
      headers: write && !form ? { "content-type": "application/json" } : undefined,
      body: !write ? undefined : form ? body : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(t("error.network"), 0);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = (data as { error?: unknown } | null)?.error;
    throw new ApiError(failureMessage(res.status, typeof msg === "string" ? msg : undefined), res.status);
  }
  return data as T;
}

export const get = <T,>(path: string, query?: Query) => api<T>("GET", path, undefined, query);

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Load data on mount (and when `deps` change). `data` stays undefined while the first load runs;
 * a failed load shows an error toast and sets `error`. `setData` updates the value locally after a write.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const v = await fnRef.current();
      if (n === seq.current) { setData(v); setError(null); }
    } catch (e) {
      if (n === seq.current) { setError(errorMessage(e)); showError(errorMessage(e)); }
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, setData, error, loading, reload };
}
