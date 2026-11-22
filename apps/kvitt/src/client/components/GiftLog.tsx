import type { Expense, GiftsResponse } from "@/shared/api";
import { CATEGORY_KEYS } from "@/shared/gifts";
import { useQuery } from "../api";
import { useHousehold } from "../household";
import { ErrorText, Spinner } from "../ui";
import { fmtDay } from "./format";
import { categoryLabel } from "./treats";
import { t, tn, locale, type MsgKey } from "../i18n";

/** Category → dot colour (chart tokens). Several categories share the palette; the label is always in the text too. */
const DOT: Record<string, string> = {
  home: "var(--chart-2)", drinks: "var(--chart-4)", restaurant: "var(--chart-5)", activity: "var(--chart-3)", other: "var(--muted-foreground)",
};

const monthOf = (ymd: string) => ymd.slice(0, 7);
const monthTitle = (ym: string) => {
  const d = new Date(`${ym}-15T12:00:00`);
  const text = d.toLocaleDateString(locale, { month: "long", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const weekdayDate = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });

/**
 * The bjudningar log (docs/decisions/kvitt-bjudningar.md): a quiet list per month, never a ranking.
 * Names are alphabetical; "last treated" is a date per person, not a count.
 */
export function GiftLog() {
  const h = useHousehold();
  const res = useQuery<GiftsResponse>(`${h.base}/gifts`);
  if (res.loading) return <Spinner />;
  if (!res.data) return <ErrorText>{res.error?.message}</ErrorText>;
  const { gifts, lastByMember, hint } = res.data;
  if (gifts.length === 0) return <p className="text-sm text-muted-foreground">{t("gifts.empty")}</p>;

  const months = [...new Set(gifts.map((g) => monthOf(g.date)))];
  const last = lastByMember
    .map((l) => ({ name: h.name(l.memberId), date: l.date }))
    .sort((a, b) => a.name.localeCompare(b.name, locale))
    .map((l) => `${l.name} ${fmtDay(l.date)}`)
    .join(" · ");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("gifts.last", { list: last })}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t("expense.category")}>
        {CATEGORY_KEYS.filter((k) => gifts.some((g) => g.category === k)).map((k) => (
          <li key={k} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: DOT[k] }} />{categoryLabel(k, h.detail.settings.categoryLabels)}</li>
        ))}
      </ul>
      {months.map((ym) => {
        const rows = gifts.filter((g) => monthOf(g.date) === ym);
        return (
          <section key={ym} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{monthTitle(ym)}</h2>
              <span className="text-xs text-muted-foreground">{tn("treats", rows.length)}</span>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {rows.map((g) => <GiftRow key={g.id} g={g} />)}
            </ul>
          </section>
        );
      })}
      {hint && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("gifts.hint")}</p>}
    </div>
  );
}

function GiftRow({ g }: { g: Expense }) {
  const h = useHousehold();
  const who = h.name(g.payerId);
  const key = g.category && (CATEGORY_KEYS as readonly string[]).includes(g.category) && g.category !== "other" ? g.category : "other";
  const custom = key !== "other" ? h.detail.settings.categoryLabels[key] : undefined;
  const text = custom ? t("gifts.did.label", { who, label: custom }) : t(`gifts.did.${key}` as MsgKey, { who, title: g.title });
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signature-soft text-sm font-semibold text-signature-foreground">{who.charAt(0).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{text}</span>
        <span className="block text-xs text-muted-foreground">{weekdayDate(g.date)}</span>
      </span>
      <span role="img" aria-label={g.category ?? ""} className="size-2 shrink-0 rounded-full" style={{ background: DOT[g.category ?? "other"] ?? DOT.other }} />
    </li>
  );
}
