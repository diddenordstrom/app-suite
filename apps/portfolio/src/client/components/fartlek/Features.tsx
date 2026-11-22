import { t } from "../../i18n";
import { cn } from "../../ui";
import { Frame } from "./live/Frame";
import { FEATURES } from "./live/sections";

/**
 * One section per feature: text beside Fartlek's real screen, swapping sides on wide screens.
 * Card screens get the wider column; phone screens sit in a soft panel like the hero. Tall screens
 * keep their text at the top, sticky, instead of centred beside a long empty stretch.
 */
export function Features() {
  return (
    <>
      {FEATURES.map((f, i) => {
        const { id, frame, Screen } = f;
        const tall = "tall" in f && f.tall;
        const flip = i % 2 === 1;
        return (
          <section key={id} id={`funktion-${id}`} aria-labelledby={`fartlek-${id}-title`} className="mx-auto max-w-[1120px] px-6 pt-[88px]">
            <div className={cn("grid gap-8 md:gap-12", tall ? "items-start" : "items-center", flip ? "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
              <div className={cn("flex max-w-[480px] flex-col gap-3", flip && "md:order-last", tall && "md:sticky md:top-12")}>
                <h2 id={`fartlek-${id}-title`} className="text-[2rem] leading-tight font-extrabold">{t(`fartlek.landing.feature.${id}.title`)}</h2>
                <p className="text-lg leading-relaxed text-muted-foreground">{t(`fartlek.landing.feature.${id}.text`)}</p>
              </div>
              <div className={cn("flex min-w-0 justify-center", frame === "phone" && "rounded-[28px] bg-muted px-4 py-10")}>
                <Frame kind={frame} label={t(`fartlek.landing.feature.${id}.label`)}>
                  <Screen />
                </Frame>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
