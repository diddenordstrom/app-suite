import { useCallback, useEffect, useState, type ReactNode } from "react";
import { lang, tnShared, tShared } from "@homelab/i18n";
import { BusyButton, Button, Card, CardTitle } from "./components";
import { ErrorText } from "./forms";

/*
 * Web Push on this device (docs/decisions/web-push.md), the client half of server-kit's createPush: asks for
 * permission from a tap, subscribes with the server's VAPID key and tells the server. The service worker side is
 * push-sw.js, added to the PWA by `pushServiceWorker()` from "@homelab/ui/vite". What the app sends and when is the
 * app's own, passed in as `children` (shown once notifications are on somewhere).
 */

/** The app's JSON fetch under /api (each app has one). */
export type PushRequest = (path: string, opts?: { method?: string; body?: unknown }) => Promise<unknown>;
interface PushInfo { enabled: boolean; publicKey: string | null; devices: number; endpoints?: string[] }
interface PushResult { sent: number; removed: number; failed: number }

export type PushSupport = "ok" | "unsupported" | "needsInstall" | "denied";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** Can this device get notifications, and if not, why: iOS only allows them for a home-screen app. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "needsInstall";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** This device's state and the actions to change it. */
export function usePush(request: PushRequest) {
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [here, setHere] = useState(false);
  const [support, setSupport] = useState<PushSupport>(() => pushSupport());
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<PushResult | null>(null);

  const load = useCallback(async () => {
    const i = await request("/push") as PushInfo;
    const sub = await currentSubscription().catch(() => null);
    const known = !!sub && !!i.endpoints?.includes(sub.endpoint);
    // Subscribed in the browser but unknown to the server (signed in again, server data reset): tell it again.
    if (sub && !known && i.enabled && Notification.permission === "granted") {
      await request("/push/subscriptions", { method: "POST", body: { ...sub.toJSON(), lang } }).catch(() => null);
      setInfo({ ...i, devices: i.devices + 1, endpoints: [...(i.endpoints ?? []), sub.endpoint] });
      setHere(true);
      return;
    }
    setInfo(i);
    setHere(known);
  }, [request]);
  useEffect(() => { void load().catch((e) => setError((e as Error).message)); }, [load]);

  const act = (kind: "on" | "off" | "test", fn: () => Promise<void>) => async () => {
    setBusy(kind); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); setSupport(pushSupport()); }
  };

  const enable = act("on", async () => {
    // First thing in the tap: Safari only asks from a user gesture.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    if (!info?.publicKey) throw new Error("No push key from the server");
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) });
    await request("/push/subscriptions", { method: "POST", body: { ...sub.toJSON(), lang } });
    await load();
  });
  const disable = act("off", async () => {
    const sub = await currentSubscription();
    if (sub) {
      await request("/push/subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } });
      await sub.unsubscribe().catch(() => false);
    }
    await load();
  });
  const test = (path = "/push/test") => act("test", async () => {
    setTested(await request(path, { method: "POST" }) as PushResult);
    await load();
  })();

  return { info, here, support, busy, error, tested, enable, disable, test, reload: load };
}

/**
 * The notifications card: turn on or off on this device, send a test, and the app's own settings as `children`.
 * Nothing in demo mode (the server says `enabled: false`).
 */
export function PushSettings({ request, intro, children, testPath }: { request: PushRequest; intro?: ReactNode; children?: ReactNode; testPath?: string }) {
  const p = usePush(request);
  if (!p.info?.enabled) return null;
  const others = p.info.devices - (p.here ? 1 : 0);
  const hint = p.support === "needsInstall" ? tShared("push.needsInstall") : p.support === "unsupported" ? tShared("push.unsupported") : p.support === "denied" ? tShared("push.denied") : null;
  return (
    <Card className="space-y-3">
      <CardTitle>{tShared("push.title")}</CardTitle>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      <p className="text-sm">
        {p.here ? tShared("push.on") : tShared("push.off")}
        {others > 0 && <> {tnShared("push.otherDevices", others)}</>}
      </p>
      {hint && !p.here && <p className="text-sm text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {!p.here && p.support === "ok" && <BusyButton busy={p.busy === "on"} busyLabel={`${tShared("push.enable")}…`} onClick={() => void p.enable()}>{tShared("push.enable")}</BusyButton>}
        {p.info.devices > 0 && <BusyButton variant="outline" busy={p.busy === "test"} busyLabel={`${tShared("push.test")}…`} onClick={() => void p.test(testPath)}>{tShared("push.test")}</BusyButton>}
        {p.here && <Button variant="ghost" disabled={p.busy === "off"} onClick={() => void p.disable()}>{tShared("push.disable")}</Button>}
      </div>
      {p.tested && <p className="text-xs text-muted-foreground">{p.tested.sent ? tShared("push.testSent") : tShared("push.testNone")}</p>}
      <ErrorText>{p.error}</ErrorText>
      {p.info.devices > 0 && children}
    </Card>
  );
}
