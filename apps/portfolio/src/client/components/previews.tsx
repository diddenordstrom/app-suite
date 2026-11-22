import { cn } from "../ui";
import { t } from "../i18n";
import { Check } from "./icons";

/** Small made-up screens for each app: decoration, no real data and no numbers. */

export function EtappPreview() {
  const chip = "rounded-full border border-border px-2.5 py-1 text-xs font-bold";
  return (
    <>
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] font-extrabold">{t("preview.etapp.trip")}</div>
        <div className="text-[13px] text-muted-foreground">{t("preview.etapp.days")}</div>
      </div>
      <svg viewBox="0 0 360 170" className="w-full" role="img" aria-label={t("preview.etapp.alt")}>
        <path d="M24 142C80 150 120 96 180 100S270 46 336 40" fill="none" className="stroke-border" strokeWidth="12" strokeLinecap="round" />
        <path d="M24 142C80 150 120 96 180 100S270 46 336 40" fill="none" className="stroke-card" strokeWidth="2" strokeDasharray="6 8" strokeLinecap="round" />
        <rect x="9" y="112" width="30" height="30" rx="6" className="fill-sign" />
        <text x="24" y="134" textAnchor="middle" className="fill-sign-foreground font-sign" fontWeight="700" fontSize="22">1</text>
        <rect x="165" y="64" width="30" height="30" rx="6" className="fill-sign" />
        <text x="180" y="86" textAnchor="middle" className="fill-sign-foreground font-sign" fontWeight="700" fontSize="22">2</text>
        <path d="M314 40 336 4 358 40Z" className="fill-tent" />
        <path d="M336 40 328 40 336 26 344 40Z" className="fill-card" />
      </svg>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={chip}>{t("preview.etapp.fika")}</span>
        <span className={chip}>{t("preview.etapp.food")}</span>
        <span className={chip}>{t("preview.etapp.see")}</span>
        <span className={chip}>{t("preview.etapp.fix")}</span>
        <span className="ml-auto text-xs font-extrabold text-tent">{t("preview.etapp.night")}</span>
      </div>
    </>
  );
}

type Bar = { h: number; kind: "easy" | "moderate" | "hard" | "rest" | "planned" };
const BARS: Bar[] = [
  { h: 70, kind: "easy" }, { h: 110, kind: "hard" }, { h: 6, kind: "rest" }, { h: 84, kind: "planned" },
  { h: 6, kind: "rest" }, { h: 130, kind: "moderate" }, { h: 52, kind: "easy" },
];
const BAR_CLASS: Record<Bar["kind"], string> = {
  easy: "bg-seq-1",
  moderate: "bg-seq-2",
  hard: "bg-seq-3",
  rest: "bg-border",
  planned: "border-2 border-dashed border-seq-2",
};

export function FartlekPreview() {
  const days = t("preview.fartlek.days").split(",");
  const legend: [string, string][] = [
    [BAR_CLASS.easy, t("preview.fartlek.easy")],
    [BAR_CLASS.moderate, t("preview.fartlek.moderate")],
    [BAR_CLASS.hard, t("preview.fartlek.hard")],
    [BAR_CLASS.planned, t("preview.fartlek.planned")],
  ];
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-extrabold">{t("preview.fartlek.week")}</div>
        <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-extrabold text-success">{t("preview.fartlek.onTrack")}</span>
      </div>
      <div className="flex h-[150px] items-end gap-2.5" role="img" aria-label={t("preview.fartlek.alt")}>
        {BARS.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className={cn("w-full rounded-lg", BAR_CLASS[b.kind])} style={{ height: b.h }} />
            <span className="text-xs text-muted-foreground">{days[i]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
        {legend.map(([cls, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", cls)} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

export function KvittPreview() {
  const items: [string, boolean][] = [
    [t("preview.kvitt.milk"), true],
    [t("preview.kvitt.bread"), true],
    [t("preview.kvitt.tomatoes"), false],
    [t("preview.kvitt.coffee"), false],
  ];
  const avatar = "inline-flex size-8 items-center justify-center rounded-full bg-sg-soft text-[13px] font-extrabold text-sg-fg";
  return (
    <>
      <div className="text-[15px] font-extrabold">{t("preview.kvitt.list")}</div>
      {items.map(([name, done]) => (
        <div key={name} className={cn("flex items-center gap-3 text-[15px]", done && "text-muted-foreground")}>
          {done
            ? <span className="inline-flex size-6 items-center justify-center rounded-full bg-sg text-brand-foreground"><Check className="size-3.5" /></span>
            : <span className="size-6 rounded-full border-2 border-muted-foreground" />}
          <span className={cn(done && "line-through")}>{name}</span>
        </div>
      ))}
      <div className="my-1 h-px bg-border" />
      <div className="flex items-center gap-2.5">
        <span className={avatar}>A</span>
        <svg viewBox="0 0 24 24" className="size-5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <span className={avatar}>B</span>
        <span className="ml-auto text-[13px] text-muted-foreground">{t("preview.kvitt.netted")}</span>
      </div>
    </>
  );
}

const BED = ["pppyye", "pphyee", "hhpppy", "eyyppp"];
const CELL: Record<string, string> = {
  p: "bg-sg",
  y: "bg-sg-soft ring-2 ring-inset ring-sg",
  h: "bg-harvest",
  e: "border-2 border-dashed border-border",
};

export function GardenPreview() {
  const legend: [string, string][] = [
    [CELL.p, t("preview.garden.planted")],
    [CELL.y, t("preview.garden.young")],
    [CELL.h, t("preview.garden.harvest")],
    [CELL.e, t("preview.garden.empty")],
  ];
  return (
    <>
      <div className="text-[15px] font-extrabold">{t("preview.garden.bed")}</div>
      <div className="grid grid-cols-6 gap-1.5" role="img" aria-label={t("preview.garden.alt")}>
        {BED.join("").split("").map((c, i) => <div key={i} className={cn("aspect-square rounded-lg", CELL[c])} />)}
      </div>
      <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
        {legend.map(([cls, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", cls)} />
            {label}
          </span>
        ))}
      </div>
      <div className="h-px bg-border" />
      <div>
        <div className="mb-1.5 flex justify-between text-[13px]">
          <span className="font-bold">{t("preview.garden.coverage")}</span>
          <span className="text-muted-foreground">{t("preview.garden.coverageNote")}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-md bg-muted">
          <div className="w-[38%] bg-sg" />
          <div className="w-[30%] bg-sg-soft ring-2 ring-inset ring-sg" />
        </div>
      </div>
    </>
  );
}

/** Brygga: the timeline (work, bridge, pension), a net-worth curve and the checks. No numbers. */
export function BryggaPreview() {
  const checks = [t("preview.brygga.bridge"), t("preview.brygga.margin"), t("preview.brygga.lasts")];
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-extrabold">{t("preview.brygga.title")}</div>
        <span className="rounded-full bg-sg-soft px-2.5 py-0.5 text-xs font-extrabold text-sg-fg">{t("preview.brygga.local")}</span>
      </div>
      <div className="flex h-7 overflow-hidden rounded-md text-xs font-bold" aria-hidden="true">
        <div className="flex w-[48%] items-center justify-center bg-muted text-muted-foreground">{t("preview.brygga.work")}</div>
        <div className="flex w-[17%] items-center justify-center bg-sg-soft text-sg-fg ring-2 ring-inset ring-sg">{t("preview.brygga.bridgePhase")}</div>
        <div className="flex flex-1 items-center justify-center bg-success/15 text-success">{t("preview.brygga.pension")}</div>
      </div>
      <svg viewBox="0 0 360 110" className="w-full" role="img" aria-label={t("preview.brygga.alt")}>
        <path d="M8 100C80 92 120 60 172 22 210 34 250 46 352 64" fill="none" className="stroke-sg" strokeWidth="3" strokeLinecap="round" />
        <path d="M8 104C90 100 130 86 172 70 200 80 230 82 352 92" fill="none" className="stroke-seq-2" strokeWidth="3" strokeLinecap="round" />
        <path d="M172 6V106M234 6V106" className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="4 3" />
      </svg>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        {checks.map((c) => (
          <li key={c} className="flex items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-3" /></span>
            {c}
          </li>
        ))}
      </ul>
    </>
  );
}
