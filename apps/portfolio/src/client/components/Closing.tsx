import { BLOG_URL } from "@/shared/apps";
import { t } from "../i18n";
import { ButtonLink } from "./ButtonLink";
import { ArrowUpRight, Pen } from "./icons";

export function BlogBand() {
  return (
    <section id="blog" aria-labelledby="blog-title" className="mx-auto max-w-[1120px] px-6 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-[28px] bg-accent px-8 py-8 text-accent-foreground md:px-10">
        <div className="flex items-center gap-4">
          <span className="inline-flex size-[52px] flex-none items-center justify-center rounded-full bg-card text-primary">
            <Pen className="size-6" />
          </span>
          <div>
            <h2 id="blog-title" className="mb-0.5 text-[22px] font-extrabold">{t("blog.title")}</h2>
            <div className="text-[15px]">{t("blog.text")}</div>
          </div>
        </div>
        <ButtonLink href={BLOG_URL}>
          {t("blog.cta")}
          <ArrowUpRight className="size-4" />
        </ButtonLink>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-3 px-6 pt-10 pb-14 text-sm text-muted-foreground">
      <span>{t("footer.text")}</span>
      <a href={BLOG_URL} className="font-bold text-primary underline">{t("footer.blog")}</a>
    </footer>
  );
}
