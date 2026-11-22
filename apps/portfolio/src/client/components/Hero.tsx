import { BLOG_URL } from "@/shared/apps";
import { t } from "../i18n";
import { MARKS } from "../ui";
import { ButtonLink } from "./ButtonLink";
import { Coffee } from "./icons";

/** A dusk scene in the suite's colours: the sun, two hills and the five marks floating above them. */
function HeroArt() {
  const Etapp = MARKS.etapp;
  const Fartlek = MARKS.fartlek;
  const Kvitt = MARKS.kvitt;
  const Garden = MARKS.garden;
  const Brygga = MARKS.brygga;
  return (
    <div aria-hidden="true" className="absolute inset-0 hidden md:block">
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-40 w-full">
        <path d="M0 200V90C160 40 320 80 500 100S820 90 1000 50V200Z" className="fill-brand" />
        <path d="M0 200V150C200 110 380 150 560 140S860 120 1000 130V200Z" className="fill-accent" />
      </svg>
      <div className="absolute right-0 bottom-0 h-[420px] w-[460px]">
      <svg viewBox="0 0 460 420" className="absolute right-0 bottom-0 h-[420px] w-[460px]">
        <circle cx="300" cy="210" r="84" className="fill-signature" />
      </svg>
      <span className="app-etapp absolute top-16 left-5 drop-shadow-lg"><Etapp className="size-14" /></span>
      <span className="app-fartlek absolute top-[18px] left-28 drop-shadow-lg"><Fartlek className="size-14" /></span>
      <span className="app-kvitt absolute top-[132px] left-[98px] drop-shadow-lg"><Kvitt className="size-14" /></span>
      <span className="app-garden absolute top-12 left-52 drop-shadow-lg"><Garden className="size-14" /></span>
      <span className="app-brygga absolute top-[200px] left-6 drop-shadow-lg"><Brygga className="size-14" /></span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <div className="mx-auto mt-2 max-w-[1120px] px-6">
      <section aria-labelledby="hero-title" className="relative flex min-h-[440px] items-center overflow-hidden rounded-[28px] bg-primary px-8 py-16 text-primary-foreground md:px-12">
        <div className="relative z-10 flex max-w-[540px] flex-col gap-5">
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-primary-foreground/15 px-3 py-1 text-[13px] font-bold">
            <span className="size-2 rounded-full bg-signature" />
            {t("hero.eyebrow")}
          </span>
          <h1 id="hero-title" className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-extrabold">{t("hero.title")}</h1>
          <p className="text-[19px] leading-relaxed">{t("hero.lead")}</p>
          <p className="flex items-start gap-2.5 text-[15px] leading-normal font-semibold">
            <Coffee className="mt-px size-5 flex-none" />
            {t("hero.coffee")}
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <ButtonLink variant="inverse" href="#fartlek">{t("hero.seeApps")}</ButtonLink>
            <ButtonLink variant="inverseOutline" href={BLOG_URL}>{t("hero.blog")}</ButtonLink>
          </div>
        </div>
        <HeroArt />
      </section>
    </div>
  );
}
