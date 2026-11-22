import { useState } from "react";
import { estimateLeg, hasCoords } from "@/shared/geo";
import { alongTheWay, legUrl } from "@/shared/links";
import type { RoutePoint } from "@/shared/plan";
import { fmtDuration, fmtKm } from "../plan";
import { ChipButton, ChipLink, Chips } from "./bits";
import { t } from "../i18n";

/** Label for a route point; the device's own location has no name of its own. */
export function pointLabel(p: RoutePoint): string {
  if (p.label) return p.label;
  if (p.kind === "start") return t("start.myLocation");
  if (p.kind === "night") return t("night.default");
  return "?";
}

/** The dotted strip between two points: where from and to, a rough estimate, directions and along-the-way searches. */
export function Leg({ from, to, area }: { from: RoutePoint; to: RoutePoint; area: string }) {
  const [along, setAlong] = useState(false);
  const est = hasCoords(from) && hasCoords(to) ? estimateLeg(from, to) : null;
  const searches = alongTheWay(from, to, area);
  return (
    <div className="ml-[18px] space-y-1.5 border-l-[3px] border-dotted border-border pl-3.5">
      <p className="text-xs text-muted-foreground">
        <b className="font-semibold text-foreground">{pointLabel(from)}</b> {t("leg.to")} <b className="font-semibold text-foreground">{pointLabel(to)}</b>
        {est && <span title={t("est.title")}> · {fmtKm(est.km)}, {fmtDuration(est.hours)} ({t("est.estimated")})</span>}
      </p>
      <Chips>
        <ChipLink href={legUrl(from, to)}>{t("leg.directions")}</ChipLink>
        {searches && <ChipButton pressed={along} onClick={() => setAlong((v) => !v)}>{t("leg.along")}</ChipButton>}
      </Chips>
      {along && searches && (
        <Chips>{searches.map((s) => <ChipLink key={s.key} href={s.url}>{t(`near.${s.key}`)}</ChipLink>)}</Chips>
      )}
    </div>
  );
}
