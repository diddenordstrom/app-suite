import { t } from "../../i18n";
import { FAQ } from "./content";
import { Chevron } from "./icons";

export function Faq() {
  return (
    <section id="fragor" aria-labelledby="fartlek-faq-title" className="mx-auto max-w-[760px] px-6 pt-[88px]">
      <h2 id="fartlek-faq-title" className="mb-6 text-[2rem] leading-tight font-extrabold">{t("fartlek.landing.faq.title")}</h2>
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {FAQ.map((q) => (
          <details key={q} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-3 text-[17px] font-bold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {t(`fartlek.landing.faq.${q}.q`)}
              <Chevron className="size-5 flex-none text-muted-foreground transition group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <p className="pb-5 text-base leading-relaxed text-muted-foreground">{t(`fartlek.landing.faq.${q}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
