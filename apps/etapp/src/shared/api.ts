/**
 * API contract shared by server and client.
 * All trip routes live under /api/t/:tid and require the viewer to be an active traveller on that trip.
 * Any traveller can edit the plan; the trip name, invite link and travellers are admin-only.
 * Timestamps are epoch ms.
 */
import type { PackGroup } from "./packing";
import type { Category, Day, Home, Plan, SleepType, StartMode, Stop, StopKind } from "./plan";
import type { QuickWarning } from "./quick";

export type Role = "admin" | "member";

export interface Member { id: number; name: string; role: Role; removed: boolean }

/** GET /api/me — who am I across trips. user is set for OIDC admins only. */
export interface MeResponse {
  user: { id: number; name: string | null; email: string | null } | null;
  authMode: "dev" | "oidc" | "demo";
  trips: { id: number; name: string; memberId: number; role: Role }[];
}

/** GET /api/t/:tid */
export interface TripDetail {
  id: number; name: string;
  me: Member;
  /** The viewer's own home on this trip. */
  home: Home;
  members: Member[]; // includes removed members (for history), flagged
  inviteCode: string | null; // only for admins
}

/** A day as the API returns it: the shared plan day plus its cover photo URL. */
export type PlanDay = Day & { photoUrl: string | null };
export interface PackItem { id: number; group: PackGroup; text: string; done: boolean }

/** GET /api/t/:tid/plan — the whole plan, days and stops in order, plus the idea bank (stops not on a day yet). */
export interface PlanResponse extends Omit<Plan, "days"> { days: PlanDay[]; ideas: Stop[]; pack: PackItem[] }

// ---- request bodies ----
export interface CreateTripBody { name: string; adminName?: string }
export interface UpdateTripBody { name?: string }
export interface JoinBody { name: string }
export interface UpdateMeBody { name?: string; homeLabel?: string; homeLat?: number | null; homeLon?: number | null }

export interface UpdatePlanBody { area?: string; startMode?: StartMode; startText?: string; startDate?: string | null }
export interface DayBody {
  title?: string;
  sleepType?: SleepType; sleepName?: string; sleepLat?: number | null; sleepLon?: number | null; sleepNote?: string;
  driveMinutes?: number | null;
}
/**
 * POST /days/:id/stops and POST /ideas create, PATCH /stops/:id edits. `todos` on create is a comma list like quick
 * entry ("fika Bakeriet, se kyrkan"); `url` on create saves a first inspiration link. `dayId` on PATCH moves the stop
 * to the end of that day, or to the idea bank with null.
 */
export interface StopBody {
  name?: string; kind?: StopKind; lat?: number | null; lon?: number | null; note?: string; openFrom?: number | null; openTo?: number | null;
  dayId?: number | null; todos?: string; url?: string;
}
export interface LinkBody { url?: string; note?: string }
export interface TodoBody { text?: string; category?: Category; done?: boolean }
export interface PackBody { group?: PackGroup; text?: string; done?: boolean }
/** POST /move on a day or stop: one step earlier (-1) or later (1). A stop at a day's edge moves into the next day. */
export interface MoveBody { dir: -1 | 1 }

/** POST /api/t/:tid/quick — apply quick entry to `dayId`. `dayId` in the reply is where later lines landed. */
export interface QuickBody { dayId: number; text: string }
export interface QuickResponse {
  dayId: number;
  added: { days: number; stops: number; vias: number; todos: number; nights: number };
  warnings: QuickWarning[];
}

/** Server-sent event on GET /api/t/:tid/events: `data` is this JSON. Clients refetch the named scopes. */
export interface ChangeEvent { scope: ("trip" | "plan")[] }
