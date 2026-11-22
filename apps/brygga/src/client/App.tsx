import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { candidates, chosenPath } from "@/shared/engine";
import { defaultScenario, toModel, type Scenario } from "@/shared/scenario";
import { TAX_YEAR } from "@/shared/tax";
import { DataPanel } from "./components/DataPanel";
import { Header } from "./components/Header";
import { Inputs, type InputsProps } from "./components/Inputs";
import { Kpis, NetWorthToday, Prognosis, ProjectionChart, Summary, type Projection } from "./components/Results";
import { t } from "./i18n";
import { loadScenario, saveScenario, storageWorks } from "./storage";
import { Card, SuiteLink } from "./ui";

function project(s: Scenario): Projection {
  const model = toModel(s);
  return { chosen: chosenPath(model), candidates: model.people.map((_, k) => candidates(model, k)) };
}

export function App() {
  const [scenario, setScenario] = useState<Scenario>(loadScenario);
  const [persisted] = useState(storageWorks);
  useEffect(() => saveScenario(scenario), [scenario]);

  // The projection runs every stop age to 100 (a few hundred milliseconds in duo): let typing stay responsive.
  const deferred = useDeferredValue(scenario);
  const projection = useMemo(() => project(deferred), [deferred]);

  const edit: Omit<InputsProps, "scenario"> = {
    setMode: (mode) => setScenario((s) => ({ ...s, mode })),
    setPerson: (k, key, v) => setScenario((s) => {
      const people = [...s.people] as Scenario["people"];
      people[k] = { ...people[k], [key]: v };
      return { ...s, people };
    }),
    setHousehold: (key, v) => setScenario((s) => ({ ...s, household: { ...s.household, [key]: v } })),
    setAssumption: (key, v) => setScenario((s) => ({ ...s, assumptions: { ...s.assumptions, [key]: v } })),
    setTax: (key, v) => setScenario((s) => ({ ...s, tax: { ...s.tax, [key]: v } })),
  };

  return (
    <div className="min-h-dvh pb-10">
      <Header />
      <main className="mx-auto grid max-w-[1180px] items-start gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className="space-y-4">
          <Summary scenario={deferred} projection={projection} />
          <Inputs scenario={scenario} {...edit} />
          <DataPanel scenario={scenario} persisted={persisted} onLoad={setScenario} onReset={() => setScenario(defaultScenario())} />
        </div>
        <div className="min-w-0 space-y-4">
          <NetWorthToday scenario={deferred} />
          <Prognosis scenario={deferred} projection={projection} />
          <Kpis scenario={deferred} projection={projection} />
          <ProjectionChart scenario={deferred} projection={projection} />
          <Card className="p-5 text-xs leading-relaxed text-muted-foreground">
            <h2 className="mb-1 text-sm font-semibold text-foreground">{t("notes.title")}</h2>
            <p>{t("notes.body", { year: TAX_YEAR })}</p>
          </Card>
        </div>
      </main>
      <footer className="mx-auto mt-8 flex max-w-[1180px] justify-center px-4 sm:px-6">
        <SuiteLink />
      </footer>
    </div>
  );
}
