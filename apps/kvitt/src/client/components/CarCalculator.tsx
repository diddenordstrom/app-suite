import { useEffect, useState } from "react";
import type { CarHelpResponse } from "@/shared/api";
import { carDistance, carGross, carTotal, parseDecimal, type CarCalc, type CarMode } from "@/shared/car";
import { useQuery } from "../api";
import { useHousehold } from "../household";
import { SegmentedControl } from "../ui";
import { t } from "../i18n";

const show = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const fmtNum = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/**
 * Bilutgift: turns a drive into the expense amount (docs/decisions/kvitt-wallets-and-car.md). Fuel (mil × l/mil × kr/l)
 * or a rate per mil, optionally a round trip, minus tankningar already logged for the drive. Prefills from the driver's
 * last car expense. Reports the calculation, or null while something is missing.
 */
export function CarCalculator({ driverId, initial, excludeId, onChange }: { driverId: number; initial: CarCalc | null; excludeId?: number; onChange: (car: CarCalc | null) => void }) {
  const h = useHousehold();
  const help = useQuery<CarHelpResponse>(`${h.base}/car/${driverId}${excludeId ? `?exclude=${excludeId}` : ""}`);
  const [mode, setMode] = useState<CarMode>(initial?.mode ?? "fuel");
  const [distance, setDistance] = useState(show(initial?.distanceMil));
  const [roundTrip, setRoundTrip] = useState(initial?.roundTrip ?? true);
  const [consumption, setConsumption] = useState(show(initial?.consumption));
  const [price, setPrice] = useState(show(initial?.fuelPrice));
  const [rate, setRate] = useState(show(initial?.rate));
  const [deductIds, setDeductIds] = useState<number[]>(initial?.deductIds ?? []);
  const [prefilled, setPrefilled] = useState(!!initial);

  // Fill in the driver's usual values once (the distance is always new).
  const last = help.data?.last;
  useEffect(() => {
    if (prefilled || help.loading) return;
    setPrefilled(true);
    if (!last) return;
    setMode(last.mode);
    setConsumption(show(last.consumption));
    setPrice(show(last.fuelPrice));
    setRate(show(last.rate));
  }, [last, prefilled, help.loading]);

  const fuel = help.data?.fuel ?? [];
  const deducted = fuel.filter((f) => deductIds.includes(f.id)).reduce((s, f) => s + f.amount, 0);
  const calc: CarCalc = {
    mode, roundTrip, distanceMil: parseDecimal(distance) ?? 0,
    consumption: mode === "fuel" ? parseDecimal(consumption) : null,
    fuelPrice: mode === "fuel" ? parseDecimal(price) : null,
    rate: mode === "rate" ? parseDecimal(rate) : null,
    deductIds: deductIds.filter((id) => fuel.some((f) => f.id === id)), deducted,
  };
  const gross = carGross(calc);
  const total = carTotal(calc);
  const key = JSON.stringify(calc);
  useEffect(() => { onChange(total === null ? null : calc); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const mil = carDistance(calc);
  const formula = gross === null ? null : mode === "fuel"
    ? t("car.formulaFuel", { mil: fmtNum(mil), l: fmtNum(calc.consumption!), kr: fmtNum(calc.fuelPrice!) })
    : t("car.formulaRate", { mil: fmtNum(mil), kr: fmtNum(calc.rate!) });

  return (
    <div className="space-y-3 rounded-lg bg-muted p-3">
      <SegmentedControl className="w-full" aria-label={t("car.mode")} value={mode} onChange={setMode}
        options={[{ value: "fuel", label: t("car.modeFuel") }, { value: "rate", label: t("car.modeRate") }]} />
      <div className="grid grid-cols-3 gap-2">
        <Unit label={t("car.distance")} unit={t("car.unitMil")} value={distance} onChange={setDistance} />
        {mode === "fuel" ? (
          <>
            <Unit label={t("car.consumption")} unit={t("car.unitPerMil")} value={consumption} onChange={setConsumption} />
            <Unit label={t("car.fuelPrice")} unit={t("car.unitKrPerL")} value={price} onChange={setPrice} />
          </>
        ) : (
          <Unit label={t("car.rate")} unit={t("car.unitKrPerMil")} value={rate} onChange={setRate} className="col-span-2" />
        )}
      </div>
      <label className="flex min-h-9 items-center justify-between gap-3 text-sm font-medium">
        <span>{t("car.roundTrip")}{calc.distanceMil > 0 && <span className="font-normal text-muted-foreground"> · {t("car.totalMil", { mil: fmtNum(mil) })}</span>}</span>
        <input type="checkbox" className="size-5 accent-[var(--signature)]" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
      </label>
      {fuel.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">{t("car.deductTitle", { name: h.name(driverId) })}</p>
          {fuel.map((f) => (
            <label key={f.id} className="flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={deductIds.includes(f.id)}
                onChange={(e) => setDeductIds(e.target.checked ? [...deductIds, f.id] : deductIds.filter((x) => x !== f.id))} />
              <span className="min-w-0 flex-1 truncate">{f.title}</span>
              <span className="tabular-nums text-muted-foreground">−{h.fmt(f.amount)}</span>
            </label>
          ))}
        </div>
      )}
      {formula && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {formula} = {h.fmt(gross!)}{deducted > 0 && <> − {h.fmt(deducted)} = <b className="text-foreground">{h.fmt(total!)}</b></>}
        </p>
      )}
    </div>
  );
}

function Unit({ label, unit, value, onChange, className }: { label: string; unit: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex h-10 items-center gap-1 rounded-md border border-border bg-card px-2 focus-within:ring-2 focus-within:ring-ring">
        <input inputMode="decimal" className="w-full min-w-0 bg-transparent text-sm outline-none" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
        <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}
