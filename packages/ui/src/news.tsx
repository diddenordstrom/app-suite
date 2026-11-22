import { useState } from "react";
import { tShared } from "@homelab/i18n";
import { Dialog } from "./Dialog";
import { Button } from "./components";
import { useTour, type Tour } from "./tour";

/**
 * "What's new": a short note shown once after a release, with an optional spotlight tour behind
 * "Show me". Entries are written per app, newest first, in Swedish (the apps' home language; the
 * buttons around them are translated as usual). Seen entries are stored like tours (`news-<id>`),
 * so an app that keeps tours on the server shows each note once per user, not once per device.
 */
export interface NewsEntry {
  /** Stable id, e.g. `2026-11-11-steg`; lowercase letters, digits and dashes. */
  id: string;
  date: string;
  title: string;
  items: string[];
  /**
   * The "Show me" walkthrough, built when it starts. It may be async, so a tour can look up what to
   * show (the user's latest structured run, say) and fall back to an explaining card.
   */
  tour?: () => Tour | Promise<Tour>;
}

export const newsSeenId = (e: NewsEntry) => `news-${e.id}`;

/**
 * Shows the newest entry once, when it hasn't been seen and no tour is running. `after`: only for
 * users who have finished that tour (a brand-new user gets the first-login tour, not release notes).
 */
export function WhatsNew({ app, entries, after = "onboarding" }: { app: string; entries: NewsEntry[]; after?: string }) {
  const { seen, active, start, markSeen } = useTour();
  const [closed, setClosed] = useState(false);
  const latest = entries[0];
  if (!latest || closed || !seen || active || !seen.includes(after) || seen.includes(newsSeenId(latest))) return null;

  const close = () => { setClosed(true); markSeen(newsSeenId(latest)); };
  const showMe = () => { close(); if (latest.tour) void Promise.resolve(latest.tour()).then(start).catch(() => {}); };
  return (
    <Dialog open onClose={close} title={tShared("news.title", { app })}>
      <NewsBody entry={latest} />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={close}>{tShared("news.close")}</Button>
        {latest.tour && <Button onClick={showMe}>{tShared("news.showMe")}</Button>}
      </div>
    </Dialog>
  );
}

function NewsBody({ entry }: { entry: NewsEntry }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="font-semibold">{entry.title}</div>
        <div className="text-xs text-muted-foreground">{entry.date}</div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm">{entry.items.map((it) => <li key={it}>{it}</li>)}</ul>
    </div>
  );
}

/** Every entry, for a "What's new" section in Settings; each with its own "Show me". */
export function NewsList({ entries, limit = 5 }: { entries: NewsEntry[]; limit?: number }) {
  const { start } = useTour();
  return (
    <ul className="space-y-4">
      {entries.slice(0, limit).map((e) => (
        <li key={e.id} className="space-y-2">
          <NewsBody entry={e} />
          {e.tour && <Button variant="outline" className="h-8 text-xs" onClick={() => void Promise.resolve(e.tour!()).then(start).catch(() => {})}>{tShared("news.showMe")}</Button>}
        </li>
      ))}
    </ul>
  );
}
