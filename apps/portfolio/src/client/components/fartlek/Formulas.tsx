import { t } from "../../i18n";
import { FORMULAS, cite, sourceById } from "./content";

/** "Why Fartlek": the argument, then every formula the app uses, written out. */
export function Formulas() {
  return (
    <section id="formler" aria-labelledby="fartlek-why-title" className="mx-auto max-w-[1120px] scroll-mt-6 px-6 pt-[88px]">
      <div className="flex max-w-[640px] flex-col gap-3">
        <h2 id="fartlek-why-title" className="text-[2rem] leading-tight font-extrabold md:text-[2.5rem]">{t("fartlek.landing.why.title")}</h2>
        <p className="text-lg leading-relaxed">{t("fartlek.landing.why.lead")}</p>
        <p className="text-base leading-relaxed text-muted-foreground">{t("fartlek.landing.why.text")}</p>
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FORMULAS.map(({ id, source }) => (
          <li key={id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <h3 className="text-[17px] font-extrabold">{t(`fartlek.landing.formula.${id}.name`)}</h3>
            <p className="rounded-lg bg-muted px-3 py-2.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{t(`fartlek.landing.formula.${id}.expr`)}</p>
            <p className="text-sm leading-normal text-muted-foreground">{t(`fartlek.landing.formula.${id}.text`)}</p>
            {source && (
              <p className="mt-auto text-[13px] text-muted-foreground">
                {t("fartlek.landing.why.source")}{" "}
                <a href={`#kalla-${source}`} className="font-bold text-primary underline">{cite(sourceById(source))}</a>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
