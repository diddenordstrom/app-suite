import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { api, useAction } from "./http";
import { BusyButton, ErrorText } from "./ui";
import { t } from "./i18n";

/**
 * "Send to the watch" for one workout, with the intervals.icu add-on connected. Upcoming workouts are
 * sent on their own, so this shows that it went and sends it again right now
 * (docs/decisions/fartlek-watch-push.md). On Home it sits at the session's edge; in the workout
 * dialog, in the row of actions.
 */
export function ToWatch({ id, sent: initial, inline = false }: { id: number; sent: boolean; inline?: boolean }) {
  const [sent, setSent] = useState(initial);
  const send = useAction(async () => {
    await api(`/intervals/push/${id}`, { method: "POST" });
    setSent(true);
  });
  const button = (
    <BusyButton variant={sent ? "ghost" : "outline"} className={inline ? "h-8 text-xs" : "h-7 px-2 text-xs"} busy={send.busy} busyLabel={`${t("today.sending")}…`} onClick={() => send.run()}>
      {sent ? t("today.toWatchAgain") : t("today.toWatch")}
    </BusyButton>
  );
  const mark = sent && <span className="text-xs" title={t("today.onWatchHint")}>✓ {t("today.onWatch")}</span>;
  return inline ? (
    <span className="inline-flex flex-wrap items-center gap-2">{button}{mark}{send.error && <ErrorText>{send.error}</ErrorText>}</span>
  ) : (
    <span className="flex flex-col items-end gap-0.5 text-right">{mark}{button}{send.error && <ErrorText>{send.error}</ErrorText>}</span>
  );
}

/** Where a workout could go to the watch but the add-on isn't connected: a quiet way to find it. */
export function WatchAddOnHint({ className = "" }: { className?: string }) {
  const { demoMode } = useAuth();
  if (demoMode) return null;
  return (
    <span className={`text-xs text-muted-foreground ${className}`}>
      {t("addons.watchHint")} <Link className="underline" to="/settings#addon-intervals">{t("addons.watchHintLink")} →</Link>
    </span>
  );
}
