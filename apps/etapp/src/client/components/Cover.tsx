import { useRef, useState, type ChangeEvent } from "react";
import type { PlanDay } from "@/shared/api";
import { ApiError, errorMessage, invalidateScopes } from "../api";
import { useTrip } from "../trip";
import { t } from "../i18n";

/** FNV-1a, so each day gets its own stable contour pattern. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Topographic contour lines, the cover for a day without a photo. */
export function Contours({ seed }: { seed: string }) {
  const r = rng(hash(seed));
  const W = 640, H = 140;
  const cx = W * (0.25 + r() * 0.5), cy = H * (0.3 + r() * 0.4);
  const p1 = r() * 6.28, p2 = r() * 6.28, k1 = 2 + Math.floor(r() * 2), k2 = 3 + Math.floor(r() * 3), sx = 1.9 + r() * 0.8;
  const rings: { pts: string; strong: boolean }[] = [];
  for (let R = 10; R <= 170; R += 13) {
    const pts: string[] = [];
    for (let j = 0; j <= 72; j++) {
      const a = (j / 72) * 6.2832;
      const rr = R * (1 + 0.2 * Math.sin(a * k1 + p1 + R * 0.012) + 0.1 * Math.sin(a * k2 + p2 - R * 0.02));
      pts.push(`${(cx + Math.cos(a) * rr * sx).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    rings.push({ pts: pts.join(" "), strong: R % 52 < 13 });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden className="block size-full">
      {rings.map((x, i) => (
        <polyline key={i} points={x.pts} fill="none" stroke="var(--primary)" strokeOpacity={x.strong ? 0.5 : 0.22} strokeWidth={x.strong ? 1.6 : 1} />
      ))}
    </svg>
  );
}

/** Scale a picture down to at most 1400 px and re-encode as JPEG, so phone photos upload fast on mobile data. */
function shrink(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const M = 1400, s = Math.min(1, M / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Shrink and PUT a photo to `/api{base}{sub}` (a day cover or a stop's photo). Throws ApiError on failure. */
export async function uploadPhoto(base: string, sub: string, file: File): Promise<void> {
  const blob = await shrink(file);
  const res = await fetch(`/api${base}${sub}`, { method: "PUT", credentials: "same-origin", headers: { "content-type": blob.type || "image/jpeg" }, body: blob });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? String(res.status), res.status);
  }
}

const btn = "inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm hover:border-primary";

/** The day's cover: its photo or contour lines, with buttons to add, change or remove the photo. */
export function Cover({ day, title }: { day: PlanDay; title: string }) {
  const { base, call, tid } = useTrip();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError(null);
    try {
      await uploadPhoto(base, `/days/${day.id}/photo`, file);
      invalidateScopes(tid, ["plan"]);
    } catch (err) {
      setError(t("cover.failed", { reason: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true); setError(null);
    try { await call("DELETE", `/days/${day.id}/photo`, undefined, ["plan"]); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="relative -mx-3.5 -mt-3.5 h-32 overflow-hidden rounded-t-lg border-b border-border bg-background sm:h-36">
        {day.photoUrl ? <img src={day.photoUrl} alt={t("cover.alt", { title })} loading="lazy" className="block size-full object-cover" /> : <Contours seed={`day-${day.id}`} />}
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button type="button" className={btn} onClick={() => input.current?.click()} disabled={busy}>{day.photoUrl ? t("cover.replace") : t("cover.add")}</button>
          {day.photoUrl && <button type="button" className={btn} onClick={() => void remove()} disabled={busy}>{t("cover.remove")}</button>}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void upload(e)} />
        {busy && <div className="absolute inset-0 grid place-items-center bg-background/70 text-sm font-semibold">{t("cover.uploading")}</div>}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </>
  );
}
