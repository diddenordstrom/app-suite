import type { ISODate } from "../../shared/dates";
import type { Lap, Stream, Wellness } from "../../shared/types";

/** Ingestion sits behind this interface (D19): Garmin first; Strava and FIT upload can be added later. */
export interface ProviderActivity {
  id: string;
  name: string;
  typeKey: string;
  startTimeLocal: string;
  distanceM: number;
  durationS: number;
  avgHr: number | null;
  maxHr: number | null;
  elevationGain: number | null;
  zoneSecs: [number, number, number, number, number] | null;
  /** The provider's event type, `race` for races (Garmin's eventType.typeKey); null when it has none. */
  eventType?: string | null;
}

/** `fit` is the raw FIT file when the provider has one; it is kept so a later change can re-parse locally instead of resyncing. */
export interface ProviderDetail { laps: Lap[]; stream: Stream | null; fit?: Uint8Array }

export interface Provider {
  name: string;
  pageSize: number;
  /** Newest first. Page 0 is the latest. */
  activities(page: number): Promise<ProviderActivity[]>;
  detail(id: string): Promise<ProviderDetail>;
  wellness(dates: ISODate[]): Promise<Wellness[]>;
  /** Running VO2max per day, when the provider estimates it. */
  vo2max?(from: ISODate, to: ISODate): Promise<DayVo2max[]>;
}

export interface DayVo2max { date: ISODate; value: number }
