import { tShared } from "@homelab/i18n";
import { Button } from "./components";

/** Shown at the top of every page while the visitor is in the demo (served from their own demo database). */
export function DemoBanner({ onEnd }: { onEnd: () => void }) {
  return (
    <div role="note" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-signature-soft px-4 py-2.5 text-sm text-signature-foreground">
      <span className="min-w-0 flex-1"><strong className="font-semibold">{tShared("demo.mode")}.</strong> {tShared("demo.banner")}</span>
      <Button variant="outline" className="h-8" onClick={onEnd}>{tShared("demo.end")}</Button>
    </div>
  );
}

const REFUSED = { full: "demo.full", limited: "demo.limited", error: "demo.error" } as const;

/** For the sign-in screen: a button that starts a demo, and why the last start was refused (/demo redirects with ?demo=…). */
export function DemoSignIn() {
  const why = new URLSearchParams(location.search).get("demo");
  const msg = why && why in REFUSED ? REFUSED[why as keyof typeof REFUSED] : null;
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => location.assign("/demo")}>{tShared("demo.try")}</Button>
      {msg && <p role="status" className="text-sm text-warning">{tShared(msg)}</p>}
    </>
  );
}
