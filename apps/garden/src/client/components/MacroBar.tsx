import { t } from "../i18n";
import { locale } from "../i18n";

/** One macro's yearly total against its target, as a labelled bar. */
export function MacroBar({ label, currentG, targetG, percent, color, testId }: { label: string; currentG: number; targetG: number; percent: number; color: string; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {t("dashboard.nutrition.coverage", { current: currentG.toLocaleString(locale), target: targetG.toLocaleString(locale), percent })}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div data-testid={`${testId}-fill`} className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}
