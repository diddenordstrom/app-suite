import { useMemo } from "react";
import { parseSteps, stepsSummary, stepsText, type ParsedSteps, type WorkoutSteps } from "../shared/steps";
import { lang } from "./i18n";
import { useFmt } from "./prefs";

/*
 * Step text helpers for the client (docs/decisions/fartlek-structured-workouts.md). The rows the
 * runner edits live in sessionbuilder.tsx; the server parses the text again on save.
 */

const stepLang = lang === "sv" ? "sv" : "en";

/** Parse the text the way the server will, in the user's units. */
export function useParsedSteps(text: string): ParsedSteps {
  const fmt = useFmt();
  return useMemo(() => parseSteps(text, fmt.units, stepLang), [text, fmt.units]);
}

/** A week chip's short label for the steps (`3×8 min tröskel`). */
export function stepsSummaryFor(steps: WorkoutSteps | null, units: "metric" | "imperial"): string | null {
  return stepsSummary(steps, stepLang, units);
}

/** The steps as text in the user's language, for the field's starting value. */
export function stepsTextFor(steps: WorkoutSteps | null, units: "metric" | "imperial"): string {
  return stepsText(steps, stepLang, units);
}
