import { describe, expect, it } from "vitest";
import { en, sv } from "../client/i18n/strings";
import { APPS, BLOG_URL, appUrl, demoUrl } from "./apps";

describe("apps", () => {
  it("lives at <id>.didrik.dev, with the blog next to them", () => {
    expect(appUrl("fartlek")).toBe("https://fartlek.didrik.dev");
    expect(appUrl("garden")).toBe("https://garden.didrik.dev");
    expect(BLOG_URL).toBe("https://blog.didrik.dev");
  });

  it("links the demos of the apps that have one", () => {
    expect(demoUrl("fartlek")).toBe("https://fartlek.didrik.dev/demo");
    expect(APPS.filter((a) => a.demo).map((a) => a.id)).toEqual(["fartlek", "kvitt", "etapp"]);
  });

  it("gives Fartlek and Kvitt their own pages", () => {
    expect(APPS.filter((a) => a.page).map((a) => [a.id, a.page])).toEqual([["fartlek", "/fartlek"], ["kvitt", "/kvitt"]]);
  });

  it("lists every app once", () => {
    const ids = APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has copy in both languages for every app", () => {
    for (const { id } of APPS) {
      for (const part of ["tag", "lead", "f1", "f2", "f3"]) {
        const key = `app.${id}.${part}` as keyof typeof en;
        expect(en[key], key).toBeTruthy();
        expect(sv[key], key).toBeTruthy();
      }
    }
  });

  it("has the same keys in Swedish and English", () => {
    expect(Object.keys(sv).sort()).toEqual(Object.keys(en).sort());
  });
});
