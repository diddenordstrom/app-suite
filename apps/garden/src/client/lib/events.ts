/** Garden chore types: their emoji and chip colour, shared by the dashboard, calendar and location pages. */
export const EVENT_TYPES = ["general", "watering", "fertilizing", "pruning", "weeding", "pest_check"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Chip classes per chore type (chart tokens, tinted, with the text in the foreground colour for contrast). */
export const EVENT_TYPE_CHIP: Record<string, { className: string; emoji: string }> = {
  watering: { className: "bg-chart-1/20 text-foreground", emoji: "💧" },
  fertilizing: { className: "bg-chart-2/20 text-foreground", emoji: "🌿" },
  pruning: { className: "bg-chart-3/20 text-foreground", emoji: "✂️" },
  weeding: { className: "bg-chart-4/20 text-foreground", emoji: "🪴" },
  pest_check: { className: "bg-chart-5/20 text-foreground", emoji: "🔍" },
};

export interface TimelineItem {
  type: "event" | "harvest";
  id: number;
  date: string;
  title: string;
  completedAt: string | null;
  locationId: number | null;
  plantingId: number | null;
  recurringDays: number | null;
  suggestionType: string | null;
  eventType: string | null;
  description: string | null;
  recurrenceRule: string | null;
  locationIds?: number[];
  plantingIds?: number[];
}
