import type { Feel, KeyFix, LowFormPlan, MovePlan, TooHard } from "@/shared/today";
import type { InjuryStop } from "@/shared/recovery";
import type { CatchUp, WeekReview } from "@/shared/weekreview";
import type { MonthStatus, SessionView, WeekStatus, WeekSummary } from "@/shared/compliance";
import type { ActivityLoad, PmcPoint } from "@/shared/load";
import type { AreaTrend, Countdown, Readiness } from "@/shared/recovery";
import type { ThresholdPoint, ThresholdProposal } from "@/shared/threshold";
import type { EasyGrade, ZoneSecs } from "@/shared/zones";
import type { ActivityLog, Durability, FuelAdvice } from "@/shared/activitylog";
import type { CsZones, ThresholdComparison } from "@/shared/criticalspeed";
import type { Activity, Block, Checkin, Lap, Msg, PainEntry, Race, Threshold, Wellness, Workout } from "@/shared/types";
import type { BlockSummary, Push, RaceHints } from "@/shared/blocks";
import type { WeekPreview } from "@/shared/blocktext";
import type { CoachResult, CoachState, Tip } from "@/shared/coach";
import type { StepMatchResult } from "@/shared/stepmatch";
import type { StreamSuggestion } from "@/shared/streamsteps";
import type { CurvePoint, Estimate, Period, TrainingContext } from "@/shared/bestefforts";

export type { WeekSummary, SessionView };

export interface GarminInfo { connected: boolean; lastSyncAt?: number | null; lastError?: string | null; daysLeft?: number | null; keyExpiresOn?: string | null; connectedAt?: number; syncing?: boolean; autoSyncDue?: boolean }

export interface HomeData {
  today: string;
  hasData: boolean;
  week: WeekSummary;
  ringGoal: number | null;
  ringGoalSource: "plan" | "average" | null;
  remaining: SessionView[];
  month: { plannedKm: number; actualKm: number; runs: number; status: MonthStatus; reasons: Msg[]; weeks: { weekStart: string; actualKm: number; targetKm: number | null; status: WeekStatus }[] };
  readiness: Readiness;
  painTrends: AreaTrend[];
  /** The "Idag" card: today's sessions, runs left behind this week, the low-form suggestion and today's feel answer. */
  todaySessions: SessionView[];
  /** Monday's check-in: last week's review, in the first days of a week. */
  review: (WeekReview & { weekEnd: string; catchUp: CatchUp | null }) | null;
  missed: (SessionView & { moveTo: string | null; swap: Extract<MovePlan, { kind: "swap" }> | null })[];
  /** A session much harder than planned in the last days, and the first step of the dial; easy runs run too fast. */
  tooHard: TooHard | null;
  tooFast: Workout[];
  lowForm: LowFormPlan | null;
  keyFixes: KeyFix[];
  feel: Feel | null;
  bodyBattery: Wellness | null;
  races: (Race & { countdown: Countdown; goalPace: number | null; neededThreshold: number | null; prediction: HomePrediction | null })[];
  threshold: Threshold | null;
  proposal: ThresholdProposal | null;
  lastRun: (Activity & { zoneSecs: ZoneSecs | null; easyScore: number | null; load: ActivityLoad }) | null;
  fitness: PmcPoint | null;
  /** Last 42 days of fitness and fatigue, for the small chart on Home. */
  loadTrend: { date: string; ctl: number; atl: number }[];
  block: Block | null;
  garmin: GarminInfo;
  /** The intervals.icu add-on, when connected: workouts already sent on to the watch. */
  watch: { sent: number[] } | null;
}

export interface PlanData { today: string; weeks: WeekSummary[]; races: Race[]; blocks: Block[];
  /** The race plan's targets for weeks not in a block yet (docs/decisions/fartlek-race-plan-skeleton.md). */
  skeleton?: Record<string, { phase: string; km: number; longKm: number | null }> }

/** Form (fitness − fatigue) into the block and out of it, or today while it runs; null before it starts. */
export interface FormPoint { value: number; pct: number }
export type BlockWithSummary = Block & { summary: BlockSummary; form: { start: FormPoint | null; end: FormPoint | null; running: boolean } | null };
export interface BlocksData { today: string; blocks: BlockWithSummary[]; races: Race[]; /** Real injury while an A race's phase is on (shared/recovery.ts `injuryStop`); null otherwise. */ injury: InjuryStop | null }
export interface BlockPreview {
  weeks: WeekPreview[];
  errors: Msg[];
  length: number;
  oldLength: number;
  pushes: Push[];
  conflict: { reason: "overlap" | "started"; block: Block } | null;
  /** The coach's verdict and suggestions; null while the text has errors. */
  coach: CoachData | null;
}
export type CoachTip = Tip & { before: number | null; after: number | null; afterState: CoachState };
export type CoachData = CoachResult & { tips: CoachTip[]; habitMin: number; crossMin: number; crossSet: boolean };
export interface RaceHintsData { today: string; hints: Record<string, RaceHints> }

export type ActivityRow = Activity & { easyScore: number | null; load: ActivityLoad; suggestedThreshold: boolean; pain: PainEntry[] };

export interface ActivityDetail {
  activity: Activity;
  metrics: { zoneSecs: ZoneSecs | null; easyScore: number | null; load: ActivityLoad; trimp: number | null };
  detailStatus: string;
  detailError: string | null;
  laps: (Lap & { pace: number | null; isInterval: boolean; range: "in" | "above" | "below" | null })[];
  estimate: Threshold | null;
  histogram: { bpm: number; secs: number }[];
  bandPace: { pace: number; hr: number; secs: number } | null;
  series: { t: number; hr: number | null; pace: number | null; alt: number | null; cad: number | null }[];
  avgCadence: number | null;
  pain: PainEntry[];
  suggestedThreshold: boolean;
  log: ActivityLog;
  logMetrics: { srpe: number | null; gPerH: number | null; gi: number | null };
  durability: Durability | null;
  /** The workout this run counts for; `match` when it has steps. */
  planned: { workout: Workout; match: StepMatchResult | null; suggestion: StreamSuggestion | null } | null;
  /** "Was this a race?" (raceresults.tsx), and the race this run was the result of. */
  candidate: import("./raceresults").RaceCandidate | null;
  race: Race | null;
}

export interface FuelRow { id: string; date: string; name: string; minutes: number; carbsG: number; gPerH: number; gi: number | null; nausea: number | null; bloating: number | null; cramps: number | null; feel: number | null }
export interface SrpeRow { id: string; date: string; name: string; rpe: number; srpe: number; load: number; method: string; trimp: number | null }
export interface DurabilityRow { id: string; date: string; name: string; km: number; driftPct: number; thirds: { pace: number; hr: number }[] }

export interface CsTest { id: number; date: string; kind: "trials" | "three_min"; inputs: unknown; csMps: number; dPrimeM: number; paceSecPerKm: number }

export interface TrendsData {
  today: string;
  /** First day of the window the curves cover. */
  from: string;
  /** Km per week; not on Fartlek's pages any more, kept for the portfolio's Fartlek landing. */
  weekly: { weekStart: string; actualKm: number; plannedKm: number | null; runs: number; minutes: number; status: WeekStatus; future: boolean }[];
  load: { series: PmcPoint[]; race: Race | null; planEnd: string | null };
  easy: { id: string; date: string; km: number; hr: number | null; pace: number | null; score: number | null; grade: EasyGrade | null; bandPace: number | null; bandHr: number | null }[];
  threshold: { points: (ThresholdPoint & { activityId: string; name: string; inRange: number | null })[]; estimates: Threshold[]; current: Threshold | null; proposal: ThresholdProposal | null };
  cs: { tests: CsTest[]; latest: CsView | null; olderTest: CsTest | null };
  best: BestEffortsData;
  vo2max: Vo2maxData;
  log: { fuel: FuelRow[]; fuelAdvice: FuelAdvice; srpe: SrpeRow[]; durability: DurabilityRow[] };
  pain: { trends: AreaTrend[]; entries: PainEntry[] };
  wellness: Wellness[];
  checkins: Checkin[];
}

export interface HomePrediction { seconds: number | null; trendPerWeek: number | null }

/** Critical speed as Trends shows it: automatic from best efforts unless a newer test wins. */
export interface CsView {
  source: "auto" | "test";
  csMps: number; dPrimeM: number; paceSecPerKm: number; r2: number | null;
  testDate: string | null;
  auto: { csMps: number; dPrimeM: number; paceSecPerKm: number; r2: number | null; efforts: CurvePoint[]; newest: string } | null;
  before: { paceSecPerKm: number; date: string } | null;
  zones: CsZones;
  comparison: ThresholdComparison | null;
}

export interface CurveCompare {
  kind: "block" | "rolling";
  current: Period; previous: Period;
  currentName?: string | null; previousName?: string | null; currentKind?: string; previousKind?: string;
  currentCurve: CurvePoint[]; previousCurve: CurvePoint[];
}
export interface BestEffortsData { pending: number; allTime: CurvePoint[]; block: CurveCompare | null; rolling: CurveCompare; gapShare: number | null }

export interface RacePredictionData {
  raceId: number;
  current: { seconds: number; model: "cs" | "riegel" | "marathon" | "between"; from: CurvePoint | null; estimates: Estimate[] | null } | null;
  trendPerWeek: number | null;
  history: { date: string; seconds: number | null }[];
  training: TrainingContext;
}

export interface Vo2maxData { points: { date: string; value: number }[]; latest: { date: string; value: number } | null; change8w: number | null }
