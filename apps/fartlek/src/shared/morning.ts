import type { Readiness } from "./recovery";
import type { SessionView } from "./compliance";
import { plannedKmOf } from "./compliance";
import type { WorkoutType } from "./types";

/*
 * The morning notification (docs/decisions/fartlek-morning-push.md): today's session and today's form, the
 * same two things the "Idag" card opens with. Pure, so the tests pin what goes out; the server writes the text.
 */

export const MORNING = {
  /** Default time for a new device, local time. */
  defaultTime: "08:00",
  /** Without last night's HRV or sleep from Garmin, wait for it this long after the time before sending anyway. */
  waitForNightMin: 120,
  /** How often Garmin is asked again while waiting. */
  retryMin: 15,
} as const;

export interface MorningParts {
  sessions: { type: WorkoutType; km: number | null }[];
  score: number | null;
  verdict: Readiness["verdict"];
  uncertain: boolean;
  /** The card has a suggestion today (low form on a key session, a missed one to move): worth opening the app. */
  suggestion: boolean;
}

/** What the notification says, from what Home would show. Sessions already run today are left out. */
export function morningParts(r: Readiness, today: SessionView[], suggestion: boolean): MorningParts {
  return {
    sessions: today.filter((s) => s.outcome !== "done" && s.outcome !== "short").map((s) => ({ type: s.workout.type, km: plannedKmOf(s.workout) || null })),
    score: r.score, verdict: r.verdict, uncertain: r.uncertain, suggestion,
  };
}

/** Has last night reached the app yet? HRV or a sleep score dated today. */
export const hasLastNight = (wellness: { date: string; hrvLastNight: number | null; sleepScore: number | null }[], today: string) =>
  wellness.some((w) => w.date === today && (w.hrvLastNight != null || w.sleepScore != null));
