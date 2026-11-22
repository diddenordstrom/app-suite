import { t } from "../../i18n";
import { ArrowUpRight } from "../icons";
import { SOURCES } from "./content";

export function Research() {
  return (
    <section id="forskning" aria-labelledby="fartlek-research-title" className="mx-auto max-w-[1120px] px-6 pt-[88px]">
      <div className="grid gap-8 rounded-[28px] border border-border bg-card p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:p-10">
        <div className="flex flex-col gap-3">
          <h2 id="fartlek-research-title" className="text-[2rem] leading-tight font-extrabold">{t("fartlek.landing.research.title")}</h2>
          <p className="text-base leading-relaxed text-muted-foreground">{t("fartlek.landing.research.lead")}</p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {SOURCES.map((s) => (
            <li key={s.id} id={`kalla-${s.id}`} className="flex scroll-mt-6 flex-col gap-1 py-4 first:pt-0 last:pb-0">
              <div className="text-[15px]">
                <span className="font-extrabold">{s.authors} ({s.year})</span>
                {s.title && <> <cite className="italic">{s.title}.</cite></>}
                {s.venue && <span className="text-muted-foreground"> {s.venue}.</span>}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{t(`fartlek.landing.research.${s.id}`)}</span>
                {s.url && (
                  <a href={s.url} className="inline-flex items-center gap-1 font-bold text-primary underline">
                    {t("fartlek.landing.research.link")}
                    <ArrowUpRight className="size-3.5" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
