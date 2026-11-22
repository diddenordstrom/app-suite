import { BLOG_URL, demoUrl } from "@/shared/apps";
import { t } from "../../i18n";
import { ButtonLink } from "../ButtonLink";
import { ArrowUpRight } from "../icons";

export function CtaBand() {
  return (
    <section aria-labelledby="fartlek-cta-title" className="mx-auto max-w-[1120px] px-6 pt-[88px]">
      <div className="flex flex-col items-start gap-4 rounded-[28px] bg-sg-soft px-6 py-10 md:flex-row md:items-center md:justify-between md:px-12">
        <div className="flex max-w-[560px] flex-col gap-2">
          <h2 id="fartlek-cta-title" className="text-[2rem] leading-tight font-extrabold">{t("fartlek.landing.cta.title")}</h2>
          <p className="text-base leading-relaxed">{t("fartlek.landing.cta.text")}</p>
          <p className="text-sm text-sg-fg">{t("app.demoHint")}</p>
        </div>
        <ButtonLink href={demoUrl("fartlek")} className="flex-none">
          {t("app.demo")}
          <ArrowUpRight className="size-4" />
        </ButtonLink>
      </div>
    </section>
  );
}

/** About me / contact. Deliberately empty for now: no email or source links (docs/decisions/open-source.md, portfolio-app.md). */
export function About() {
  return (
    <section id="kontakt" aria-labelledby="fartlek-about-title" className="mx-auto max-w-[760px] px-6 pt-[72px]">
      <h2 id="fartlek-about-title" className="mb-2 text-[1.5rem] font-extrabold">{t("fartlek.landing.about.title")}</h2>
      {/* TODO: about me and contact, once decided. */}
      <p className="text-base text-muted-foreground">{t("fartlek.landing.about.text")}</p>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="mx-auto mt-16 max-w-[1120px] px-6 pb-14 text-sm text-muted-foreground">
      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-8">
        <span>
          {t("fartlek.landing.footer.text")}{" "}
          <a href="/" className="font-bold text-primary underline">{t("fartlek.landing.back")}</a>
        </span>
        <a href={BLOG_URL} className="font-bold text-primary underline">{t("footer.blog")}</a>
      </div>
    </footer>
  );
}
