/** Error toasts: anything can call showError(); <ErrorToasts /> in the shell renders them for six seconds. */
import { useSyncExternalStore } from "react";
import { t } from "./i18n";

interface Toast { id: number; message: string }
let toasts: Toast[] = [];
let nextId = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function dismissError(id: number) {
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

export function showError(message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, message }];
  emit();
  setTimeout(() => dismissError(id), 6000);
}

/** Report an unexpected failure (a rejected action nobody caught). */
export function reportError(e: unknown) {
  showError(e instanceof Error ? e.message : String(e));
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export function ErrorToasts() {
  const list = useSyncExternalStore(subscribe, () => toasts);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4">
      {list.map((err) => (
        <div key={err.id} role="alert" className="pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-lg border border-danger/30 bg-danger px-4 py-3 text-sm text-white shadow-lg">
          <p className="flex-1 break-words">{err.message}</p>
          <button type="button" aria-label={t("common.dismiss")} className="shrink-0 opacity-70 hover:opacity-100" onClick={() => dismissError(err.id)}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
