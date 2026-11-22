import { useEffect } from "react";
import { t } from "../../i18n";
import { Faq } from "./Faq";
import { Features } from "./Features";
import { Formulas } from "./Formulas";
import { About, CtaBand, LandingFooter } from "./LandingClosing";
import { LandingHeader } from "./LandingHeader";
import { LandingHero } from "./LandingHero";
import { Pillars } from "./Pillars";
import { Research } from "./Research";

/** Fartlek's landing page at /fartlek. The whole page reads Fartlek's coral trio through .app-fartlek. */
export function FartlekPage() {
  useEffect(() => {
    const before = document.title;
    document.title = t("fartlek.landing.meta.title");
    return () => { document.title = before; };
  }, []);
  return (
    <div className="app-fartlek min-h-dvh">
      <LandingHeader />
      <main>
        <LandingHero />
        <Pillars />
        <Features />
        <Formulas />
        <Research />
        <Faq />
        <CtaBand />
        <About />
      </main>
      <LandingFooter />
    </div>
  );
}
