import type { ComponentType } from "react";
import { t } from "../../i18n";
import { PILLARS } from "./content";
import { Book, Code, Gift, Sigma } from "./icons";

const ICONS: Record<(typeof PILLARS)[number], ComponentType<{ className?: string }>> = {
  free: Gift,
  open: Code,
  formulas: Sigma,
  research: Book,
};

export function Pillars() {
  return (
    <section aria-labelledby="fartlek-pillars-title" className="mx-auto max-w-[1120px] px-6 pt-12">
      <h2 id="fartlek-pillars-title" className="sr-only">{t("fartlek.landing.pillars.title")}</h2>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        {PILLARS.map((p) => {
          const Icon = ICONS[p];
          return (
            <li key={p} className="flex flex-col gap-2">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-sg-soft text-sg-fg">
                <Icon className="size-5" />
              </span>
              <div className="text-[17px] font-extrabold">{t(`fartlek.landing.pillar.${p}.title`)}</div>
              <div className="text-sm leading-normal text-muted-foreground">{t(`fartlek.landing.pillar.${p}.text`)}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
