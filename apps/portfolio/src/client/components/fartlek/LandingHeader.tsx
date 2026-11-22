import { LANGS, lang, setLang, t, type Lang } from "../../i18n";
import { MARKS, SegmentedControl, ThemePicker } from "../../ui";
import { ArrowLeft } from "./icons";

export function LandingHeader() {
  const Mark = MARKS.fartlek;
  return (
    <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-4">
      <nav aria-label={t("fartlek.landing.nav.label")} className="flex items-center gap-3">
        <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-semibold text-muted-foreground transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" />
          {t("fartlek.landing.back")}
        </a>
        <span className="flex items-center gap-2 text-lg font-extrabold">
          <Mark className="size-8" />
          Fartlek
        </span>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Lang> value={lang} options={LANGS} onChange={setLang} aria-label={t("settings.language")} />
        <ThemePicker />
      </div>
    </header>
  );
}
