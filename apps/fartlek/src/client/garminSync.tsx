import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./http";
import type { GarminInfo } from "./types";

export interface SyncResult { added: number; details: number; moreDetails: number }

interface SyncState {
  /** A sync is running, whether started by the button, by visiting the app or in another tab. */
  busy: boolean;
  error: string | null;
  result: SyncResult | null;
  /** Bumps after every finished sync, so pages can reload their data. */
  version: number;
  run: () => Promise<void>;
}

const Ctx = createContext<SyncState>({ busy: false, error: null, result: null, version: 0, run: async () => {} });

/**
 * One Garmin sync state for the whole app. On load it asks the server whether a sync is running
 * or due (last one over an hour ago); if so it starts or joins it. No polling.
 */
export function SyncProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [version, setVersion] = useState(0);
  const running = useRef<Promise<void> | null>(null);

  const start = useCallback((auto: boolean) => {
    if (running.current) return running.current;
    setBusy(true);
    setError(null);
    const p = api<SyncResult | { skipped: true }>(`/sync${auto ? "?auto=1" : ""}`, { method: "POST" })
      .then((r) => {
        if ("skipped" in r) return;
        setResult(r);
        setVersion((v) => v + 1);
      })
      .catch((e: Error) => {
        setError(e.message);
        setVersion((v) => v + 1); // lastError on the server changed
      })
      .finally(() => {
        running.current = null;
        setBusy(false);
      });
    running.current = p;
    return p;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    api<GarminInfo>("/garmin")
      .then((g) => { if (g.connected && (g.syncing || g.autoSyncDue)) void start(true); })
      .catch(() => {}); // the pages show their own load errors
  }, [enabled, start]);

  const run = useCallback(() => start(false), [start]);
  return <Ctx.Provider value={{ busy, error, result, version, run }}>{children}</Ctx.Provider>;
}

export const useSync = () => useContext(Ctx);

/** Reload a page's data whenever a sync finishes. */
export function useReloadOnSync(reload: () => unknown) {
  const { version } = useSync();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void reload();
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
}
