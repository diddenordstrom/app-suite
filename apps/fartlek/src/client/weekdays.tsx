import { t, WEEKDAY_LONG, WEEKDAY_SHORT } from "./i18n";
import { Input, Select, cn } from "./ui";
import type { CrossDay, Settings } from "@/shared/types";

/*
 * The runner's week in one place (docs/decisions/fartlek-gym-cross-days.md): each weekday is a rest day, a run day, the
 * long-run day, a gym day or a cross-training day with its minutes. Used by Skapa block's second step and the settings
 * page; it edits the four settings that hold it (runDays, longRunDay, gymDays, crossDays).
 */

export type WeekDays = Pick<Settings, "runDays" | "longRunDay" | "gymDays" | "crossDays" | "doubles">;
type Role = "rest" | "run" | "long" | "gym" | "cross";
const ROLES: Role[] = ["rest", "run", "long", "gym", "cross"];
const CROSS_MIN = 45;

/** The weekdays in the runner's week order, 0 = Sunday. */
export const weekOrder = (start: Settings["weekStart"]) => (start === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);

export function roleOf(v: WeekDays, d: number): Role {
  if (d === v.longRunDay) return "long";
  if (v.gymDays.includes(d)) return "gym";
  if (v.crossDays.some((c) => c.day === d)) return "cross";
  return v.runDays.includes(d) ? "run" : "rest";
}

/**
 * The week with day `d` set to `role`. There is always one long-run day: picking it on another day makes the old one a
 * run day, and giving the long-run day another role moves the long run to the last run day of the week (refused without one).
 */
export function withRole(v: WeekDays, d: number, role: Role, order: number[]): WeekDays | null {
  const roles = new Map(order.map((x) => [x, roleOf(v, x)]));
  const mins = new Map(v.crossDays.map((c) => [c.day, c.min]));
  if (role === "long") { roles.set(v.longRunDay, "run"); roles.set(d, "long"); }
  else {
    roles.set(d, role);
    if (d === v.longRunDay) {
      const to = [...order].reverse().find((x) => roles.get(x) === "run");
      if (to == null) return null;
      roles.set(to, "long");
    }
  }
  const is = (r: Role) => order.filter((x) => roles.get(x) === r);
  return {
    doubles: v.doubles,
    runDays: [...is("run"), ...is("long")].sort(),
    longRunDay: is("long")[0],
    gymDays: is("gym").sort(),
    crossDays: is("cross").sort((a, b) => a - b).map((x): CrossDay => ({ day: x, min: mins.get(x) ?? CROSS_MIN })),
  };
}

const ROLE_COLOR: Record<Role, string> = {
  rest: "", run: "var(--chart-3)", long: "var(--chart-1)", gym: "var(--muted-foreground)", cross: "var(--muted-foreground)",
};

export function WeekDaysEditor({ value, onChange, weekStart }: { value: WeekDays; onChange: (v: WeekDays) => void; weekStart: Settings["weekStart"] }) {
  const order = weekOrder(weekStart);
  const setMin = (d: number, min: number) => onChange({ ...value, crossDays: value.crossDays.map((c) => (c.day === d ? { ...c, min } : c)) });
  return (
    <div className="space-y-1.5" role="group" aria-label={t("wd.title")}>
      {order.map((d) => {
        const role = roleOf(value, d);
        const cross = value.crossDays.find((c) => c.day === d);
        return (
          <div key={d} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_7rem]">
            <span className="text-sm font-semibold"><span className="sm:hidden">{WEEKDAY_SHORT[d]}</span><span className="hidden sm:inline">{WEEKDAY_LONG[d]}</span></span>
            <div role="radiogroup" aria-label={WEEKDAY_LONG[d]} className="grid grid-cols-5 gap-0.5 rounded-lg bg-muted p-0.5">
              {ROLES.map((r) => {
                const on = r === role;
                const next = on ? null : withRole(value, d, r, order);
                return (
                  <button key={r} type="button" role="radio" aria-checked={on} aria-label={t(`wd.${r}`)} disabled={!on && !next} onClick={() => next && onChange(next)}
                    title={!on && !next ? t("wd.needRun") : undefined}
                    className={cn("flex h-9 min-w-0 items-center justify-center gap-1 truncate rounded-md px-1 text-xs sm:text-sm",
                      on ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground", !on && !next && "cursor-not-allowed opacity-50")}>
                    {on && r !== "rest" && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: ROLE_COLOR[r] }} />}
                    <span className="truncate sm:hidden">{t(`wd.${r}Short`)}</span>
                    <span className="hidden truncate sm:inline">{t(`wd.${r}`)}</span>
                  </button>
                );
              })}
            </div>
            {cross ? (
              <label className="col-start-2 flex items-center gap-2 text-sm sm:col-start-3">
                <Input type="number" inputMode="numeric" min={5} max={600} step={15} className="h-9 w-20" aria-label={t("wd.min", { day: WEEKDAY_LONG[d].toLowerCase() })}
                  value={Number.isFinite(cross.min) ? cross.min : ""} onChange={(e) => setMin(d, e.target.value === "" ? NaN : Math.round(Number(e.target.value)))} />
                <span className="text-muted-foreground">min</span>
              </label>
            ) : <span className="hidden sm:block" />}
          </div>
        );
      })}
      {/* Doubles only make sense with a gym day (docs/decisions/fartlek-gym-cross-days.md). */}
      {value.gymDays.length > 0 && (
        <label className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-sm">
          <span className="font-medium">{t("wd.doubles")}</span>
          <Select className="h-9 w-auto" value={value.doubles} onChange={(e) => onChange({ ...value, doubles: e.target.value as WeekDays["doubles"] })}>
            {(["off", "gym", ...(value.crossDays.length ? ["all"] : [])] as WeekDays["doubles"][]).map((m) => <option key={m} value={m}>{t(`wd.doubles.${m}`)}</option>)}
          </Select>
          <span className="basis-full text-xs text-muted-foreground">{t("wd.doublesHint")}</span>
        </label>
      )}
    </div>
  );
}

/** Minutes are whole numbers from 5 to 600. */
export const weekDaysValid = (v: WeekDays) => v.crossDays.every((c) => Number.isInteger(c.min) && c.min >= 5 && c.min <= 600);

/** A gym day right before the long run, for a note (the long run stays where it is). */
export const gymBeforeLong = (v: WeekDays) => v.gymDays.find((d) => (d + 1) % 7 === v.longRunDay);
