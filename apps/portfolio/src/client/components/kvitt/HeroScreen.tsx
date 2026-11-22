import { t } from "../../i18n";
import { cn } from "../../ui";
import { Arrows } from "./icons";

const avatar = "inline-flex size-8 flex-none items-center justify-center rounded-full bg-sg-soft text-[13px] font-extrabold text-sg-fg";

/**
 * A made-up Kvitt balance screen in a phone frame, drawn with the portfolio's tokens (not Kvitt's
 * real components): a ski trip where a couple counts as one, a payment that can wait inside the
 * green zone, and the two latest expenses.
 */
export function HeroScreen({ className }: { className?: string }) {
  const payments: { from: string; to: string; amount: string; wait?: boolean }[] = [
    { from: "J", to: "D&S", amount: "1 240 kr" },
    { from: "M", to: "D&S", amount: "860 kr" },
    { from: "A", to: "M", amount: "80 kr", wait: true },
  ];
  const latest: [string, string, string][] = [
    [t("kvitt.landing.demo.fuel"), t("kvitt.landing.demo.fuelMeta"), "1 680 kr"],
    [t("kvitt.landing.demo.food"), t("kvitt.landing.demo.foodMeta"), "2 214 kr"],
  ];
  return (
    <figure aria-label={t("kvitt.landing.hero.label")} className={cn("w-full max-w-[340px] rounded-[44px] bg-bezel p-2 shadow-xl", className)}>
      <div aria-hidden="true" className="space-y-4 rounded-[36px] bg-background px-4 pt-7 pb-32 text-foreground">
        <div>
          <div className="text-[13px] font-bold text-muted-foreground">{t("kvitt.landing.demo.group")}</div>
          <div className="text-[22px] font-extrabold">{t("kvitt.landing.demo.balance")}</div>
        </div>
        <div className="space-y-3 rounded-2xl bg-card p-4 shadow-sm">
          <div className="text-[13px] font-bold text-muted-foreground">{t("kvitt.landing.demo.settle")}</div>
          {payments.map((p) => (
            <div key={p.from + p.to} className={cn("flex items-center gap-2", p.wait && "text-muted-foreground")}>
              <span className={avatar}>{p.from}</span>
              <Arrows className="size-4 flex-none text-muted-foreground" />
              <span className={cn(avatar, p.to.length > 1 && "w-auto px-2")}>{p.to}</span>
              <span className="ml-auto text-right text-[15px] font-extrabold">
                {p.amount}
                {p.wait && <span className="block text-[11px] font-bold">{t("kvitt.landing.demo.wait")}</span>}
              </span>
            </div>
          ))}
          <div className="rounded-xl bg-sg-fg py-2.5 text-center text-[15px] font-extrabold text-sg-soft">{t("kvitt.landing.demo.swish")} 1 240 kr</div>
        </div>
        <div className="space-y-2">
          <div className="text-[13px] font-bold text-muted-foreground">{t("kvitt.landing.demo.latest")}</div>
          {latest.map(([title, meta, amount]) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold">{title}</div>
                <div className="truncate text-[12px] text-muted-foreground">{meta}</div>
              </div>
              <span className="ml-auto flex-none text-[15px] font-extrabold">{amount}</span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
