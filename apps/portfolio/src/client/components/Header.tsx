import { APPS, BLOG_URL } from "@/shared/apps";
import { LANGS, lang, setLang, t, type Lang } from "../i18n";
import { Logo, SegmentedControl, ThemePicker } from "../ui";

const navLink = "rounded-lg px-3 py-2.5 text-[15px] font-semibold text-muted-foreground transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";

export function Header() {
  return (
    <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="flex items-center gap-2.5 text-lg font-extrabold">
        <Logo className="size-8" />
        App-suite
      </div>
      <nav aria-label={t("nav.label")} className="flex flex-wrap items-center gap-0.5">
        {APPS.map((a) => <a key={a.id} href={`#${a.id}`} className={navLink}>{a.name}</a>)}
        <a href={BLOG_URL} className={navLink}>{t("nav.blog")}</a>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Lang> value={lang} options={LANGS} onChange={setLang} aria-label={t("settings.language")} />
        <ThemePicker />
      </div>
    </header>
  );
}
