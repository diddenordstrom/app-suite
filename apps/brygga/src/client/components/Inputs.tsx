import { useState } from "react";
import type { Assumptions, Household, Person } from "@/shared/engine";
import { monthlyPayment } from "@/shared/engine";
import type { Kind } from "@/shared/format";
import { ASSUMPTION_BOUNDS, HOUSEHOLD_BOUNDS, PERSON_BOUNDS, TAX_BOUNDS, savingsCheck, type Mode, type Scenario } from "@/shared/scenario";
import { RULES_2026, TAX_YEAR, type TaxParams } from "@/shared/tax";
import { kr } from "../format";
import { t, type MsgKey } from "../i18n";
import { Card, SegmentedControl } from "../ui";
import { NumberField } from "./NumberField";

interface Spec<K extends string> {
  key: K;
  kind: Kind;
  slider?: { min: number; max: number; step: number };
  hint?: string;
}

const PERSON_GROUPS: { title: MsgKey; fields: Spec<keyof Person>[] }[] = [
  { title: "group.about", fields: [
    { key: "age", kind: "years", slider: { min: 18, max: 80, step: 1 } },
    { key: "retAge", kind: "years", slider: { min: 40, max: 75, step: 1 } },
    { key: "salary", kind: "money", slider: { min: 0, max: 3_000_000, step: 10_000 } },
    { key: "salaryGrowth", kind: "percent" },
  ] },
  { title: "group.start", fields: [
    { key: "allmStart", kind: "years", slider: { min: RULES_2026.earliestPublicPension, max: 75, step: 1 }, hint: t("hint.allmStart", { age: RULES_2026.earliestPublicPension }) },
    { key: "tjStart", kind: "years", slider: { min: 55, max: 75, step: 1 } },
  ] },
  { title: "group.assets", fields: [
    { key: "stocks", kind: "money", slider: { min: 0, max: 10_000_000, step: 10_000 }, hint: t("hint.stocks") },
    { key: "stockSave", kind: "money", slider: { min: 0, max: 50_000, step: 500 } },
    { key: "priv", kind: "money", slider: { min: 0, max: 10_000_000, step: 10_000 }, hint: t("hint.priv") },
    { key: "privSave", kind: "money", slider: { min: 0, max: 30_000, step: 100 } },
    { key: "tjanst", kind: "money", slider: { min: 0, max: 10_000_000, step: 10_000 }, hint: t("hint.tjanst") },
    { key: "allm", kind: "money", slider: { min: 0, max: 10_000_000, step: 10_000 }, hint: t("hint.allm") },
  ] },
];

const HOME: Spec<keyof Household>[] = [
  { key: "house", kind: "money", slider: { min: 0, max: 20_000_000, step: 50_000 } },
  { key: "loan", kind: "money", slider: { min: 0, max: 15_000_000, step: 10_000 } },
  { key: "loanRate", kind: "percent", slider: { min: 0, max: 10, step: 0.05 } },
  { key: "amort", kind: "percent", slider: { min: 0, max: 10, step: 0.5 } },
];

const EXPENSES: Spec<keyof Household>[] = [
  { key: "expensesNow", kind: "money", slider: { min: 0, max: 150_000, step: 1000 }, hint: t("hint.expensesNow") },
  { key: "expensesAfter", kind: "money", slider: { min: 0, max: 150_000, step: 1000 }, hint: t("hint.expensesAfter") },
];

const ASSUMPTION_GROUPS: { title: MsgKey; fields: (keyof Assumptions)[] }[] = [
  { title: "group.returns", fields: ["stockRet", "privRet", "tjRet", "allmRet", "houseGrowth"] },
  { title: "group.economy", fields: ["inflation"] },
  { title: "group.pensionSystem", fields: ["allmPct", "divisor", "tjPct", "tjDivisor"] },
  { title: "group.bridge", fields: ["bryggRet", "margin", "swr"] },
];
const YEAR_FIELDS = new Set<keyof Assumptions>(["divisor", "tjDivisor"]);

const TAX_FIELDS: Spec<keyof TaxParams>[] = [
  { key: "municipalRate", kind: "percent", hint: t("hint.municipalRate") },
  { key: "govRate", kind: "percent", hint: t("hint.govRate") },
  { key: "iskAllowance", kind: "money" },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

export interface InputsProps {
  scenario: Scenario;
  setMode: (m: Mode) => void;
  setPerson: (k: number, key: keyof Person, v: number) => void;
  setHousehold: (key: keyof Household, v: number) => void;
  setAssumption: (key: keyof Assumptions, v: number) => void;
  setTax: (key: keyof TaxParams, v: number) => void;
}

export function Inputs({ scenario: s, setMode, setPerson, setHousehold, setAssumption, setTax }: InputsProps) {
  const [who, setWho] = useState<"0" | "1">("0");
  const k = s.mode === "duo" ? Number(who) : 0;
  const person = s.people[k];
  const check = savingsCheck(s);
  const checkKey: MsgKey = check.ok ? "check.ok" : check.gap < 0 ? "check.tooMuch" : "check.tooLittle";

  return (
    <Card className="space-y-6 p-5">
      <div className="space-y-3">
        <SegmentedControl<Mode>
          aria-label={t("mode.label")}
          value={s.mode}
          onChange={setMode}
          options={[{ value: "single", label: t("mode.single") }, { value: "duo", label: t("mode.duo") }]}
          className="w-full"
        />
        {s.mode === "duo" && (
          <SegmentedControl<"0" | "1">
            aria-label={t("person.label")}
            value={who}
            onChange={setWho}
            options={[{ value: "0", label: t("person.you") }, { value: "1", label: t("person.partner") }]}
            className="w-full"
          />
        )}
        <p className="text-xs text-muted-foreground">{t("app.tip")}</p>
      </div>

      {PERSON_GROUPS.map((g) => (
        <Group key={g.title} title={t(g.title)}>
          {g.fields.map((f) => (
            <NumberField
              key={`${k}-${f.key}`}
              label={t(`field.${f.key}` as MsgKey)}
              value={person[f.key]}
              onChange={(v) => setPerson(k, f.key, v)}
              kind={f.kind}
              slider={f.slider}
              min={PERSON_BOUNDS[f.key].min}
              max={PERSON_BOUNDS[f.key].max}
              hint={f.hint}
            />
          ))}
        </Group>
      ))}

      <Group title={t("group.home")}>
        {HOME.map((f) => (
          <NumberField key={f.key} label={t(`field.${f.key}` as MsgKey)} value={s.household[f.key]} onChange={(v) => setHousehold(f.key, v)}
            kind={f.kind} slider={f.slider} min={HOUSEHOLD_BOUNDS[f.key].min} max={HOUSEHOLD_BOUNDS[f.key].max} />
        ))}
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("payment", { amount: kr(monthlyPayment(s.household)) })}
        </p>
      </Group>

      <Group title={t("group.expenses")}>
        {EXPENSES.map((f) => (
          <NumberField key={f.key} label={t(`field.${f.key}` as MsgKey)} value={s.household[f.key]} onChange={(v) => setHousehold(f.key, v)}
            kind={f.kind} slider={f.slider} min={HOUSEHOLD_BOUNDS[f.key].min} max={HOUSEHOLD_BOUNDS[f.key].max} hint={f.hint} />
        ))}
        <p role="status" className={check.ok ? "rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" : "rounded-md bg-warning/15 px-3 py-2 text-xs text-warning"}>
          {t(checkKey, {
            net: kr(check.netSalary), exp: kr(s.household.expensesNow), pay: kr(monthlyPayment(s.household)),
            left: kr(check.implied), saved: kr(check.stated), gap: kr(Math.abs(check.gap)),
          })}
        </p>
      </Group>

      <details className="group border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-primary">{t("group.advanced")}</summary>
        <div className="mt-4 space-y-6">
          {ASSUMPTION_GROUPS.map((g) => (
            <Group key={g.title} title={t(g.title)}>
              {g.fields.map((key) => (
                <NumberField key={key} label={t(`field.${key}` as MsgKey)} value={s.assumptions[key]} onChange={(v) => setAssumption(key, v)}
                  kind={YEAR_FIELDS.has(key) ? "years" : "percent"} min={ASSUMPTION_BOUNDS[key].min} max={ASSUMPTION_BOUNDS[key].max} />
              ))}
            </Group>
          ))}
          <Group title={t("group.tax", { year: TAX_YEAR })}>
            {TAX_FIELDS.map((f) => (
              <NumberField key={f.key} label={t(`field.${f.key}` as MsgKey)} value={s.tax[f.key]} onChange={(v) => setTax(f.key, v)}
                kind={f.kind} min={TAX_BOUNDS[f.key].min} max={TAX_BOUNDS[f.key].max} hint={f.hint} />
            ))}
          </Group>
        </div>
      </details>
    </Card>
  );
}
