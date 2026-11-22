import { t } from "../i18n";
import { cn } from "../ui";

const FACTS = ["stack", "ui", "lang", "many"] as const;
const STEPS = ["s1", "s2", "s3", "s4"] as const;

/** What the apps have in common, and how a change gets from a push to the home server. */
export function Foundation() {
  return (
    <section id="stack" aria-labelledby="foundation-title" className="mx-auto max-w-[1120px] px-6 pt-[72px]">
      <div className="grid items-start gap-10 rounded-[28px] border border-border bg-card p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:p-10">
        <div className="flex flex-col gap-3">
          <h2 id="foundation-title" className="text-3xl leading-tight font-extrabold">{t("foundation.title")}</h2>
          <p className="text-base leading-relaxed text-muted-foreground">{t("foundation.lead")}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {FACTS.map((f) => (
            <div key={f}>
              <div className="mb-1 text-[15px] font-extrabold">{t(`foundation.${f}.title`)}</div>
              <div className="text-sm leading-normal text-muted-foreground">{t(`foundation.${f}.text`)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[28px] border border-border bg-card p-8 md:px-10">
        <h3 className="mb-1 text-[22px] font-extrabold">{t("pipeline.title")}</h3>
        <p className="mb-6 text-[15px] leading-normal text-muted-foreground">{t("pipeline.lead")}</p>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col gap-2">
              <span className={cn("inline-flex size-9 items-center justify-center rounded-full font-extrabold", i === STEPS.length - 1 ? "bg-signature-soft text-signature-foreground" : "bg-accent text-accent-foreground")}>{i + 1}</span>
              <div className="text-[15px] font-extrabold">{t(`pipeline.${s}.title`)}</div>
              <div className="text-sm leading-normal text-muted-foreground">{t(`pipeline.${s}.text`)}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
