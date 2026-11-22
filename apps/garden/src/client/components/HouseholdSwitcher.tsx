import { useHousehold } from "../household";
import { t } from "../i18n";
import { reportError } from "../toast";
import { Select } from "./Select";

/** Shown only when the user belongs to more than one household. */
export function HouseholdSwitcher() {
  const { current, households, switchTo } = useHousehold();
  if (households.length < 2) return null;
  return (
    <Select
      data-testid="household-switcher"
      className="min-w-0 max-w-44"
      triggerClassName="h-8 text-xs"
      aria-label={t("householdSwitcher.ariaLabel")}
      value={current.id}
      options={households.map((h) => ({ value: h.id, label: h.name }))}
      onChange={(id) => { switchTo(id).catch(reportError); }}
    />
  );
}
