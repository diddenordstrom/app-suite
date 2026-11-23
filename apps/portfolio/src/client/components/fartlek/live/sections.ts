import type { ComponentType } from "react";
import { ActivityScreen, BlockScreen, FuelScreen, GymScreen, LoadScreen, PaceScreen, RaceScreen, WeekScreen } from "./screens";

/**
 * The feature sections of the Fartlek page, in order: each one's copy (`fartlek.landing.feature.<id>.*`),
 * the live Fartlek screen beside it and the frame it sits in. `tall` screens get their text at the top,
 * sticky while the screen scrolls past. Remove an entry to drop a section.
 */
export const FEATURES = [
  { id: "load", frame: "card", Screen: LoadScreen },
  { id: "pace", frame: "card", Screen: PaceScreen },
  { id: "race", frame: "card", Screen: RaceScreen },
  { id: "week", frame: "phone", Screen: WeekScreen },
  { id: "block", frame: "card", Screen: BlockScreen },
  { id: "activity", frame: "card", Screen: ActivityScreen, tall: true },
  { id: "fuel", frame: "card", Screen: FuelScreen },
  { id: "gym", frame: "phone", Screen: GymScreen },
] as const satisfies readonly { id: string; frame: "phone" | "card"; Screen: ComponentType; tall?: boolean }[];
