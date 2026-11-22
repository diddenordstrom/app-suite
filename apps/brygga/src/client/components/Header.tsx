import { LANGS, lang, setLang, t, type Lang } from "../i18n";
import { Logo, SegmentedControl, ThemePicker } from "../ui";

export function Header() {
  return (
    <header className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 pt-5 pb-3 sm:px-6">
      <div className="flex items-center gap-3">
        <Logo className="size-9" />
        <div>
          <h1 className="text-xl leading-tight font-extrabold">Brygga</h1>
          <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Lang> value={lang} options={LANGS} onChange={setLang} aria-label={t("settings.language")} />
        <ThemePicker />
      </div>
    </header>
  );
}
