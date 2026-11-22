/** The apps the portfolio links to, in the order shown: roughly by complexity. Copy for each one lives in the i18n dictionaries under `app.<id>.*`. */
export const DOMAIN = "didrik.dev";

export type AppId = "etapp" | "fartlek" | "kvitt" | "garden" | "brygga";

export interface AppInfo {
  id: AppId;
  /** Display name; the garden app is called Autarki but its folder, image and host are `garden`. */
  name: string;
  /** Has a demo mode at <url>/demo: visitors without an account get a throwaway one. */
  demo?: boolean;
  /** Has its own landing page on the portfolio at this path; its card links there instead of to the app. */
  page?: string;
}

export const APPS: readonly AppInfo[] = [
  { id: "fartlek", name: "Fartlek", demo: true, page: "/fartlek" },
  { id: "kvitt", name: "Kvitt", demo: true, page: "/kvitt" },
  { id: "garden", name: "Autarki" },
  { id: "etapp", name: "Etapp", demo: true },
  { id: "brygga", name: "Brygga" },
];

/** Every app lives at <id>.<domain>. */
export const appUrl = (id: AppId) => `https://${id}.${DOMAIN}`;
export const demoUrl = (id: AppId) => `${appUrl(id)}/demo`;
export const BLOG_URL = `https://blog.${DOMAIN}`;
