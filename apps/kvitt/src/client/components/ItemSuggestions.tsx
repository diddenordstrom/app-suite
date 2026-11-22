import type { ItemSuggestion } from "@/shared/api";
import { useQuery } from "../api";
import { useHousehold } from "../household";
import { t } from "../i18n";
import { cn } from "../ui";

export const normText = (s: string) => s.trim().toLocaleLowerCase();

/**
 * Rank household item history for the add-item input. `all` arrives sorted by count, then recency.
 * Empty query: most frequent first. Otherwise prefix matches before substring matches, then count, then recency.
 * Texts in `exclude` (normalized, e.g. items already on the list) are dropped.
 */
export function rankSuggestions(all: ItemSuggestion[], query: string, exclude: Set<string>, limit: number): ItemSuggestion[] {
  const q = normText(query);
  const out: { s: ItemSuggestion; prefix: boolean }[] = [];
  for (const s of all) {
    const t = normText(s.text);
    if (!t || exclude.has(t)) continue;
    if (!q) out.push({ s, prefix: true });
    else if (t.includes(q)) out.push({ s, prefix: t.startsWith(q) });
  }
  out.sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.s.count - a.s.count || b.s.lastUsed - a.s.lastUsed);
  return out.slice(0, limit).map((x) => x.s);
}

/**
 * Horizontal chip row of item suggestions under the add-item input. Fixed height (reserved once there is any
 * history) so the list below doesn't jump while typing; chips don't steal focus so the keyboard stays up.
 */
export function ItemSuggestions({ query, exclude, onPick }: { query: string; exclude: Set<string>; onPick: (s: ItemSuggestion) => void }) {
  const h = useHousehold();
  const { data } = useQuery<ItemSuggestion[]>(`${h.base}/items/suggestions`);
  if (!data?.length) return null;
  const typing = query.trim() !== "";
  const shown = rankSuggestions(data, query, exclude, typing ? 6 : 10);
  return (
    <div
      role="group"
      aria-label={typing ? t("suggest.suggestions") : t("suggest.frequent")}
      className="-mx-1 flex h-11 items-center gap-2 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {shown.map((s) => (
        <button
          key={normText(s.text)}
          type="button"
          // Keep focus (and the on-screen keyboard) on the input.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s)}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-4 text-sm font-medium transition active:scale-95 focus-visible:outline-2 focus-visible:outline-ring",
            typing ? "bg-accent text-accent-foreground" : "bg-card text-foreground hover:bg-accent",
          )}
        >
          <span className="text-muted-foreground" aria-hidden>+</span>
          {s.text}
          {s.quantity && <span className="font-normal text-muted-foreground">· {s.quantity}</span>}
        </button>
      ))}
    </div>
  );
}
