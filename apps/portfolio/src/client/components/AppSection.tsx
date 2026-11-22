import type { ComponentType } from "react";
import { appUrl, demoUrl, type AppId, type AppInfo } from "@/shared/apps";
import { t } from "../i18n";
import { MARKS, cn } from "../ui";
import { ButtonLink } from "./ButtonLink";
import { ArrowUpRight, Check } from "./icons";
import { BryggaPreview, EtappPreview, GardenPreview, FartlekPreview, KvittPreview } from "./previews";

const PREVIEWS: Record<AppId, ComponentType> = {
  etapp: EtappPreview,
  fartlek: FartlekPreview,
  kvitt: KvittPreview,
  garden: GardenPreview,
  brygga: BryggaPreview,
};

const FEATURES = ["f1", "f2", "f3"] as const;

/** One app: what it is, three things it does and a link, next to a small made-up screen of it. */
export function AppSection({ app, flip }: { app: AppInfo; flip?: boolean }) {
  const Mark = MARKS[app.id];
  const Preview = PREVIEWS[app.id];
  return (
    <section id={app.id} aria-labelledby={`${app.id}-title`} className={cn(`app-${app.id}`, "mx-auto max-w-[1120px] px-6 pt-[72px]")}>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Mark className="size-11" />
            <span className="rounded-full bg-sg-soft px-2.5 py-1 text-[13px] font-bold text-sg-fg">{t(`app.${app.id}.tag`)}</span>
          </div>
          <h2 id={`${app.id}-title`} className="text-[2.75rem] leading-[1.1] font-extrabold">{app.name}</h2>
          <p className="text-lg leading-relaxed">{t(`app.${app.id}.lead`)}</p>
          <ul className="flex flex-col gap-2.5 text-base">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-5 flex-none text-sg-fg" />
                {t(`app.${app.id}.${f}`)}
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {app.page ? (
              <>
                {app.demo && (
                  <ButtonLink href={demoUrl(app.id)}>
                    {t("app.demo")}
                    <ArrowUpRight className="size-4" />
                  </ButtonLink>
                )}
                <ButtonLink variant="outline" href={app.page}>{t("app.readMore")}</ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink href={appUrl(app.id)}>
                  {t("app.open", { name: app.name })}
                  <ArrowUpRight className="size-4" />
                </ButtonLink>
                {app.demo && (
                  <ButtonLink variant="outline" href={demoUrl(app.id)}>
                    {t("app.demo")}
                    <ArrowUpRight className="size-4" />
                  </ButtonLink>
                )}
              </>
            )}
          </div>
          {app.demo && <p className="text-sm text-muted-foreground">{t("app.demoHint")}</p>}
        </div>
        <div className={cn("flex min-h-[360px] items-center justify-center rounded-[28px] bg-sg-soft p-7", flip && "md:order-first")}>
          <div className="flex w-full max-w-[420px] flex-col gap-3 rounded-2xl border border-border bg-card p-[18px]">
            <Preview />
          </div>
        </div>
      </div>
    </section>
  );
}
