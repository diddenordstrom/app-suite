import { useEffect, type ComponentType } from "react";
import { BLOG_URL, demoUrl } from "@/shared/apps";
import { LANGS, lang, setLang, t, type Lang, type MsgKey } from "../../i18n";
import { MARKS, SegmentedControl, ThemePicker, cn } from "../../ui";
import { ButtonLink } from "../ButtonLink";
import { ArrowUpRight } from "../icons";
import { ArrowLeft, Chevron, Code, Gift } from "../fartlek/icons";
import { HeroScreen } from "./HeroScreen";
import { Arrows, Check, Heart, Link, NoAds, Phone, Plane, Repeat, Shield } from "./icons";

type Icon = ComponentType<{ className?: string }>;

/**
 * Kvitt's landing page at /kvitt: a short pitch (two to three minutes of reading) for groups of
 * friends. Reads Kvitt's green trio through .app-kvitt. Copy: ../../i18n/kvittLanding.ts.
 */
export function KvittPage() {
  useEffect(() => {
    const before = document.title;
    document.title = t("kvitt.landing.meta.title");
    return () => { document.title = before; };
  }, []);
  return (
    <div className="app-kvitt min-h-dvh">
      <Header />
      <main>
        <Hero />
        <Pillars />
        <Account />
        <Modes />
        <Extras />
        <Compare />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}

const h2 = "text-[2rem] leading-tight font-extrabold";
const iconDot = "inline-flex size-11 flex-none items-center justify-center rounded-full bg-sg-soft text-sg-fg";

function Header() {
  const Mark = MARKS.kvitt;
  return (
    <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-4">
      <nav aria-label={t("kvitt.landing.nav.label")} className="flex items-center gap-3">
        <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-semibold text-muted-foreground transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" />
          {t("fartlek.landing.back")}
        </a>
        <span className="flex items-center gap-2 text-lg font-extrabold">
          <Mark className="size-8" />
          Kvitt
        </span>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Lang> value={lang} options={LANGS} onChange={setLang} aria-label={t("settings.language")} />
        <ThemePicker />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="mx-auto mt-2 max-w-[1120px] px-6">
      <section aria-labelledby="kvitt-hero-title" className="grid items-end gap-10 overflow-hidden rounded-[28px] bg-sg-soft px-6 pt-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:px-12 md:pt-16">
        <div className="flex max-w-[540px] flex-col gap-5 md:self-center md:pb-16">
          <h1 id="kvitt-hero-title" className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-extrabold">{t("kvitt.landing.hero.title")}</h1>
          <p className="text-[19px] leading-relaxed">{t("kvitt.landing.hero.lead")}</p>
          <div className="mt-1 flex flex-wrap gap-3">
            <ButtonLink href={demoUrl("kvitt")}>
              {t("app.demo")}
              <ArrowUpRight className="size-4" />
            </ButtonLink>
            <ButtonLink variant="outline" href="#jamfor" className="border-sg-fg/40 text-sg-fg hover:bg-card">{t("kvitt.landing.hero.compare")}</ButtonLink>
          </div>
          <p className="text-sm text-sg-fg">{t("app.demoHint")}</p>
        </div>
        <div className="flex justify-center">
          <HeroScreen className="-mb-24" />
        </div>
      </section>
    </div>
  );
}

const PILLARS: [string, Icon][] = [["free", Gift], ["open", Code], ["noads", NoAds], ["data", Shield]];

function Pillars() {
  return (
    <section aria-labelledby="kvitt-pillars-title" className="mx-auto max-w-[1120px] px-6 pt-12">
      <h2 id="kvitt-pillars-title" className="sr-only">{t("kvitt.landing.pillars.title")}</h2>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        {PILLARS.map(([p, Icon]) => (
          <li key={p} className="flex flex-col gap-2">
            <span className={iconDot}><Icon className="size-5" /></span>
            <div className="text-[17px] font-extrabold">{t(`kvitt.landing.pillar.${p}.title` as MsgKey)}</div>
            <div className="text-sm leading-normal text-muted-foreground">{t(`kvitt.landing.pillar.${p}.text` as MsgKey)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The one-account point gets its own band: it's the thing a group notices first. */
function Account() {
  return (
    <section aria-labelledby="kvitt-account-title" className="mx-auto max-w-[1120px] px-6 pt-[88px]">
      <div className="flex flex-col gap-6 rounded-[28px] border border-border bg-card px-6 py-10 md:flex-row md:items-center md:gap-10 md:px-12">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-sg-fg text-xl font-extrabold text-sg-soft">D</span>
          <Link className="size-6 text-muted-foreground" />
          <span className="flex -space-x-3">
            {["J", "M", "A", "S"].map((c) => (
              <span key={c} className="inline-flex size-11 items-center justify-center rounded-full border-2 border-card bg-sg-soft text-[15px] font-extrabold text-sg-fg">{c}</span>
            ))}
          </span>
        </div>
        <div className="flex max-w-[560px] flex-col gap-2">
          <h2 id="kvitt-account-title" className={h2}>{t("kvitt.landing.account.title")}</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">{t("kvitt.landing.account.text")}</p>
        </div>
      </div>
    </section>
  );
}

const MODES: [string, Icon][] = [["trip", Plane], ["ongoing", Repeat]];

function Modes() {
  return (
    <section aria-labelledby="kvitt-modes-title" className="mx-auto max-w-[1120px] px-6 pt-[88px]">
      <h2 id="kvitt-modes-title" className={cn(h2, "mb-6")}>{t("kvitt.landing.modes.title")}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {MODES.map(([m, Icon]) => (
          <div key={m} className="flex flex-col gap-3 rounded-[22px] bg-sg-soft p-6 md:p-8">
            <Icon className="size-7 text-sg-fg" />
            <h3 className="text-[1.375rem] font-extrabold">{t(`kvitt.landing.mode.${m}.title` as MsgKey)}</h3>
            <p className="text-base leading-relaxed">{t(`kvitt.landing.mode.${m}.text` as MsgKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const EXTRAS: [string, Icon][] = [["wallet", Heart], ["swish", Phone], ["fewer", Arrows]];

function Extras() {
  return (
    <section aria-labelledby="kvitt-extras-title" className="mx-auto max-w-[1120px] px-6 pt-[72px]">
      <h2 id="kvitt-extras-title" className={cn(h2, "mb-6")}>{t("kvitt.landing.extras.title")}</h2>
      <ul className="grid gap-6 md:grid-cols-3">
        {EXTRAS.map(([e, Icon]) => (
          <li key={e} className="flex gap-4">
            <span className={iconDot}><Icon className="size-5" /></span>
            <div className="flex flex-col gap-1">
              <div className="text-[17px] font-extrabold">{t(`kvitt.landing.extra.${e}.title` as MsgKey)}</div>
              <div className="text-sm leading-normal text-muted-foreground">{t(`kvitt.landing.extra.${e}.text` as MsgKey)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ROWS = ["price", "limits", "accounts", "swish", "currency", "app", "open"] as const;
const COLS = ["kvitt", "splitwise", "steven"] as const;
const COL_NAMES: Record<(typeof COLS)[number], string> = { kvitt: "Kvitt", splitwise: "Splitwise", steven: "Steven" };

/** Honest comparison: a table, then one line per app on when it's the better pick. */
function Compare() {
  return (
    <section id="jamfor" aria-labelledby="kvitt-cmp-title" className="mx-auto max-w-[1120px] px-6 pt-[88px]">
      <h2 id="kvitt-cmp-title" className={h2}>{t("kvitt.landing.cmp.title")}</h2>
      <p className="mt-2 mb-6 max-w-[640px] text-lg leading-relaxed text-muted-foreground">{t("kvitt.landing.cmp.lead")}</p>
      <div className="overflow-x-auto rounded-[22px] border border-border">
        <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
          <caption className="sr-only">{t("kvitt.landing.cmp.caption")}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-4"><span className="sr-only">{t("kvitt.landing.cmp.feature")}</span></th>
              {COLS.map((c) => (
                <th key={c} scope="col" className={cn("p-4 text-[17px] font-extrabold", c === "kvitt" && "bg-sg-soft text-sg-fg")}>{COL_NAMES[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r} className="border-b border-border last:border-0">
                <th scope="row" className="p-4 align-top font-bold text-muted-foreground">{t(`kvitt.landing.cmp.${r}` as MsgKey)}</th>
                {COLS.map((c) => (
                  <td key={c} className={cn("p-4 align-top leading-snug", c === "kvitt" && "bg-sg-soft font-bold")}>{t(`kvitt.landing.cmp.${r}.${c}` as MsgKey)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-10 mb-4 text-[1.375rem] font-extrabold">{t("kvitt.landing.cmp.pick.title")}</h3>
      <ul className="flex flex-col gap-3 text-base leading-relaxed">
        {(["splitwise", "steven", "kvitt"] as const).map((c) => (
          <li key={c} className="flex items-start gap-3">
            <Check className={cn("mt-1 size-4 flex-none", c === "kvitt" ? "text-sg-fg" : "text-muted-foreground")} />
            {t(`kvitt.landing.cmp.pick.${c}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

const FAQ = ["q1", "q2", "q3"] as const;

function Faq() {
  return (
    <section aria-labelledby="kvitt-faq-title" className="mx-auto max-w-[760px] px-6 pt-[88px]">
      <h2 id="kvitt-faq-title" className={cn(h2, "mb-6")}>{t("kvitt.landing.faq.title")}</h2>
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {FAQ.map((q) => (
          <details key={q} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-3 text-[17px] font-bold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {t(`kvitt.landing.faq.${q}.q`)}
              <Chevron className="size-5 flex-none text-muted-foreground transition group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <p className="pb-5 text-base leading-relaxed text-muted-foreground">{t(`kvitt.landing.faq.${q}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section aria-labelledby="kvitt-cta-title" className="mx-auto max-w-[1120px] px-6 pt-[88px]">
      <div className="flex flex-col items-start gap-4 rounded-[28px] bg-sg-soft px-6 py-10 md:flex-row md:items-center md:justify-between md:px-12">
        <div className="flex max-w-[560px] flex-col gap-2">
          <h2 id="kvitt-cta-title" className={h2}>{t("kvitt.landing.cta.title")}</h2>
          <p className="text-base leading-relaxed">{t("kvitt.landing.cta.text")}</p>
          <p className="text-sm text-sg-fg">{t("app.demoHint")}</p>
        </div>
        <ButtonLink href={demoUrl("kvitt")} className="flex-none">
          {t("app.demo")}
          <ArrowUpRight className="size-4" />
        </ButtonLink>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto mt-16 max-w-[1120px] px-6 pb-14 text-sm text-muted-foreground">
      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-8">
        <span>
          {t("kvitt.landing.footer.text")}{" "}
          <a href="/" className="font-bold text-primary underline">{t("fartlek.landing.back")}</a>
        </span>
        <a href={BLOG_URL} className="font-bold text-primary underline">{t("footer.blog")}</a>
      </div>
    </footer>
  );
}
