import { demoUrl } from "@/shared/apps";
import { t } from "../../i18n";
import { ButtonLink } from "../ButtonLink";
import { ArrowUpRight } from "../icons";
import { Frame } from "./live/Frame";
import { TodayScreen } from "./live/screens";

/** Slogan and the demo on the left, Fartlek's live start page in a phone frame rising out of the panel's bottom edge. */
export function LandingHero() {
  return (
    <div className="mx-auto mt-2 max-w-[1120px] px-6">
      <section aria-labelledby="fartlek-hero-title" className="grid items-end gap-10 overflow-hidden rounded-[28px] bg-sg-soft px-6 pt-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:px-12 md:pt-16">
        <div className="flex max-w-[540px] flex-col gap-5 md:self-center md:pb-16">
          <h1 id="fartlek-hero-title" className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-extrabold">{t("fartlek.landing.hero.title")}</h1>
          <p className="text-[19px] leading-relaxed">{t("fartlek.landing.hero.lead")}</p>
          <div className="mt-1 flex flex-wrap gap-3">
            <ButtonLink href={demoUrl("fartlek")}>
              {t("app.demo")}
              <ArrowUpRight className="size-4" />
            </ButtonLink>
            <ButtonLink variant="outline" href="#formler" className="border-sg-fg/40 text-sg-fg hover:bg-card">{t("fartlek.landing.hero.how")}</ButtonLink>
          </div>
          <p className="text-sm text-sg-fg">{t("app.demoHint")}</p>
        </div>
        <div className="flex justify-center">
          <Frame kind="phone" label={t("fartlek.landing.hero.label")} className="-mb-28 max-w-[340px]">
            <TodayScreen />
          </Frame>
        </div>
      </section>
    </div>
  );
}
