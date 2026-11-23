/*
 * The gym module's catalogue and templates (docs/decisions/fartlek-gym-module.md). Written by hand and
 * shipped with the app: each exercise has a movement pattern, and a template is a list of slots, one
 * pattern each, with ranked choices. Swapping an exercise offers the others with the same pattern, and
 * history follows the exercise, not the slot. Names live in the client's i18n (`ex.<id>`); an exercise
 * the catalogue doesn't know (typed in, or imported) has the id `x:<name>` and shows that name.
 */

export const PATTERNS = [
  "knee_single", "knee_double", "hinge", "hamstring", "quad", "calf", "hip_abd", "hip_add", "core", "shin", "knee_control",
  "push", "chest", "pull_v", "pull_h", "shoulder", "lateral", "rear_delt", "biceps", "triceps",
] as const;
export type Pattern = (typeof PATTERNS)[number];

/** kg = weight per set; bw = body weight, optionally with added kg; time = held for seconds. */
export type Load = "kg" | "bw" | "time";
export type Purpose = "hyp" | "prev" | "both";

export interface Exercise {
  id: string;
  pattern: Pattern;
  load: Load;
  purpose: Purpose;
  /** The next step up in kg (dumbbells per hand). Unused for time. */
  step: number;
  /** Exercise names in other log apps' exports that mean this one (Bolt first). */
  aliases?: string[];
}

const ex = (id: string, pattern: Pattern, load: Load, purpose: Purpose, step: number, aliases?: string[]): Exercise => ({ id, pattern, load, purpose, step, aliases });

export const EXERCISES: Exercise[] = [
  ex("bulgarian_split_squat", "knee_single", "kg", "both", 2, ["Bulgarian Split Squat", "Bulgarian Split Squat (Dumbbell)"]),
  ex("step_up", "knee_single", "kg", "both", 2, ["Step Up", "Step Up (Dumbbell)"]),
  ex("single_leg_press", "knee_single", "kg", "both", 5, ["Single Leg Press"]),
  ex("reverse_lunge", "knee_single", "kg", "both", 2, ["Lunge (Dumbbell)", "Reverse Lunge (Dumbbell)"]),
  ex("leg_press", "knee_double", "kg", "hyp", 5, ["Leg Press", "Leg Press (Machine)"]),
  ex("hack_squat", "knee_double", "kg", "hyp", 5, ["Hack Squat", "Hack Squat (Machine)"]),
  ex("squat_machine", "knee_double", "kg", "hyp", 5, ["Squat (Machine)"]),
  ex("squat", "knee_double", "kg", "hyp", 2.5, ["Squat (Barbell)"]),
  ex("goblet_squat", "knee_double", "kg", "both", 2, ["Goblet Squat", "Goblet Squat (Kettlebell)"]),
  ex("stiff_leg_deadlift", "hinge", "kg", "both", 2.5, ["Stiff Leg Deadlift", "Stiff Leg Deadlift (Barbell)"]),
  ex("rdl_dumbbell", "hinge", "kg", "both", 2, ["Romanian Deadlift (Dumbbell)"]),
  ex("rdl", "hinge", "kg", "both", 2.5, ["Romanian Deadlift (Barbell)"]),
  ex("single_leg_rdl", "hinge", "kg", "prev", 2, ["Single Leg Romanian Deadlift (Dumbbell)"]),
  ex("hip_thrust", "hinge", "kg", "both", 2.5, ["Hip Thrust (Barbell)", "Hip Thrust"]),
  ex("cable_pull_through", "hinge", "kg", "both", 2.5, ["Cable Pull Through"]),
  ex("seated_leg_curl", "hamstring", "kg", "both", 2.5, ["Seated Leg Curl", "Seated Leg Curl (Machine)"]),
  ex("lying_leg_curl", "hamstring", "kg", "both", 2.5, ["Lying Leg Curl", "Lying Leg Curl (Machine)"]),
  ex("nordic_curl", "hamstring", "bw", "prev", 2.5, ["Nordic Hamstring Curl"]),
  ex("leg_extension", "quad", "kg", "both", 2.5, ["Leg Extension", "Leg Extension (Machine)"]),
  ex("spanish_squat", "quad", "time", "prev", 0),
  ex("wall_sit", "quad", "time", "prev", 0, ["Wall Sit"]),
  ex("seated_calf_raise", "calf", "kg", "both", 2.5, ["Seated Calf Raise", "Seated Calf Raise (Machine)"]),
  ex("single_leg_calf_raise", "calf", "bw", "prev", 2, ["Single Leg Calf Raise"]),
  ex("standing_calf_raise", "calf", "kg", "both", 2.5, ["Standing Calf Raise", "Calf Raise (Machine)"]),
  ex("hip_abduction", "hip_abd", "kg", "prev", 2.5, ["Hip Abduction (Machine)", "Hip Abductor"]),
  ex("side_plank_leg_lift", "hip_abd", "time", "prev", 0),
  ex("monster_walk", "hip_abd", "bw", "prev", 0),
  ex("copenhagen_plank", "hip_add", "time", "prev", 0, ["Copenhagen Plank"]),
  ex("hip_adduction", "hip_add", "kg", "prev", 2.5, ["Hip Adduction (Machine)", "Hip Adductor"]),
  ex("pallof_press", "core", "kg", "prev", 2.5, ["Pallof Press"]),
  ex("dead_bug", "core", "bw", "prev", 0, ["Dead Bug"]),
  ex("plank", "core", "time", "prev", 0, ["Plank"]),
  ex("tibialis_raise", "shin", "bw", "prev", 0, ["Tibialis Raise"]),
  ex("step_down", "knee_control", "bw", "prev", 2),
  ex("glute_bridge_single", "knee_control", "bw", "prev", 2, ["Single Leg Glute Bridge"]),
  ex("bench_press", "push", "kg", "hyp", 2.5, ["Bench Press (Barbell)", "Bench Press"]),
  ex("incline_bench_smith", "push", "kg", "hyp", 2.5, ["Incline Bench Press (Smith Machine)"]),
  ex("incline_db_press", "push", "kg", "hyp", 2, ["Incline Bench Press (Dumbbell)"]),
  ex("db_bench_press", "push", "kg", "hyp", 2, ["Bench Press (Dumbbell)"]),
  ex("push_up", "push", "bw", "both", 0, ["Push Up"]),
  ex("chest_fly_machine", "chest", "kg", "hyp", 2.5, ["Chest Fly (Machine)"]),
  ex("chest_fly_db", "chest", "kg", "hyp", 1, ["Chest Fly (Dumbbell)"]),
  ex("pull_up", "pull_v", "bw", "hyp", 2.5, ["Pull Up (Bodyweight)", "Pull Up", "Chin Up"]),
  ex("lat_pulldown", "pull_v", "kg", "hyp", 2.5, ["Lat Pulldown (Machine)", "Lat Pulldown (Cable)", "Lat Pulldown"]),
  ex("seated_row", "pull_h", "kg", "hyp", 2.5, ["Seated Row", "Seated Row (Cable)", "Seated Row (Machine)"]),
  ex("one_arm_db_row", "pull_h", "kg", "hyp", 2, ["Bent Over One Arm Row (Dumbbell)", "Dumbbell Row"]),
  ex("shoulder_press", "shoulder", "kg", "hyp", 2, ["Shoulder Press", "Shoulder Press (Dumbbell)"]),
  ex("seated_db_press", "shoulder", "kg", "hyp", 2, ["Seated Overhead Press (Dumbbell)"]),
  ex("overhead_press", "shoulder", "kg", "hyp", 2.5, ["Overhead Press (Barbell)"]),
  ex("lateral_raise", "lateral", "kg", "hyp", 1, ["Side Delt Raises", "Lateral Raise (Dumbbell)"]),
  ex("cable_lateral_raise", "lateral", "kg", "hyp", 1, ["Lateral Raise (Cable)"]),
  ex("upright_row_cable", "lateral", "kg", "hyp", 2.5, ["Upright Row (Cable)"]),
  ex("face_pull", "rear_delt", "kg", "both", 2.5, ["Face Pull (Cable)", "Face Pull"]),
  ex("reverse_fly", "rear_delt", "kg", "hyp", 1, ["Reverse Fly (Dumbbell)"]),
  ex("db_curl", "biceps", "kg", "hyp", 1, ["Bicep Curl (Dumbbell)"]),
  ex("cable_curl", "biceps", "kg", "hyp", 2.5, ["Bicep Curl (Machine)", "Bicep Curl (Cable)"]),
  ex("hammer_curl", "biceps", "kg", "hyp", 1, ["Hammer Curl (Dumbbell)"]),
  ex("triceps_pushdown", "triceps", "kg", "hyp", 2.5, ["Tricep Pushdown", "Triceps Pushdown (Cable)"]),
  ex("triceps_extension_db", "triceps", "kg", "hyp", 1, ["Tricep Extension (Dumbbell)", "Overhead Tricep Extension (Dumbbell)"]),
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
const BY_ALIAS = new Map(EXERCISES.flatMap((e) => (e.aliases ?? []).map((a) => [a.toLowerCase(), e] as const)));

export const CUSTOM_PREFIX = "x:";
export const isCustom = (id: string) => id.startsWith(CUSTOM_PREFIX);
export const customName = (id: string) => id.slice(CUSTOM_PREFIX.length);
export const customId = (name: string) => CUSTOM_PREFIX + name.trim().replace(/\s+/g, " ").slice(0, 60);

/** The catalogue entry, or a stand-in for an exercise the catalogue doesn't know (counted in kg). */
export function exercise(id: string): Exercise {
  return BY_ID.get(id) ?? { id, pattern: "push", load: "kg", purpose: "hyp", step: 2.5 };
}
export const known = (id: string) => BY_ID.has(id);

/** Map a name from another app's export to a catalogue id, or a custom id that keeps the name. */
export function fromExportName(name: string): string {
  return BY_ALIAS.get(name.trim().toLowerCase())?.id ?? customId(name);
}

/** Exercises with the same pattern as `id`, the slot's own ranked choices first. */
export function alternatives(id: string, ranked: string[] = []): string[] {
  const p = exercise(id).pattern;
  const same = EXERCISES.filter((e) => e.pattern === p).map((e) => e.id);
  return [...new Set([...ranked, ...same])].filter((x) => x !== id);
}

/** Sets × reps (or seconds) a slot asks for: double progression within `low`–`high`. */
export interface Scheme { sets: number; low: number; high: number }

export interface Slot { pattern: Pattern; scheme: Scheme; choices: string[] }

export const TEMPLATE_IDS = ["A", "B", "C", "F"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface Template { id: TemplateId; minutes: number; slots: Slot[]; extras: string[] }

const s = (pattern: Pattern, sets: number, low: number, high: number, choices: string[]): Slot => ({ pattern, scheme: { sets, low, high }, choices });

/**
 * A: legs and prevention (single-leg work, a hinge, hamstrings, calves, hip abductors, anti-rotation core).
 * B: upper body. C: gentle, for a day with a niggle (slow step-downs, holds, no heavy load on the knee).
 * F: full body, for a week with one gym session: legs and prevention first, then a press and a row.
 */
export const TEMPLATES: Record<TemplateId, Template> = {
  A: {
    id: "A", minutes: 45, extras: ["leg_extension", "tibialis_raise", "copenhagen_plank"], slots: [
      s("knee_single", 3, 8, 10, ["bulgarian_split_squat", "step_up", "single_leg_press"]),
      s("hinge", 3, 8, 10, ["stiff_leg_deadlift", "rdl_dumbbell", "single_leg_rdl"]),
      s("hamstring", 3, 10, 12, ["seated_leg_curl", "lying_leg_curl", "nordic_curl"]),
      s("calf", 3, 12, 15, ["seated_calf_raise", "single_leg_calf_raise"]),
      s("hip_abd", 3, 12, 15, ["hip_abduction", "side_plank_leg_lift"]),
      s("core", 3, 10, 12, ["pallof_press", "dead_bug"]),
    ],
  },
  B: {
    id: "B", minutes: 45, extras: ["lateral_raise", "face_pull", "chest_fly_machine"], slots: [
      s("push", 3, 5, 8, ["bench_press", "incline_bench_smith", "incline_db_press"]),
      s("pull_v", 3, 6, 10, ["pull_up", "lat_pulldown"]),
      s("pull_h", 3, 8, 12, ["seated_row", "one_arm_db_row"]),
      s("shoulder", 3, 8, 12, ["shoulder_press", "seated_db_press"]),
      s("biceps", 3, 8, 12, ["db_curl", "cable_curl", "hammer_curl"]),
      s("triceps", 3, 8, 12, ["triceps_pushdown", "triceps_extension_db"]),
    ],
  },
  F: {
    id: "F", minutes: 50, extras: ["pull_up", "seated_leg_curl", "pallof_press"], slots: [
      s("knee_single", 3, 8, 10, ["bulgarian_split_squat", "step_up", "single_leg_press"]),
      s("hinge", 3, 8, 10, ["stiff_leg_deadlift", "rdl_dumbbell", "single_leg_rdl"]),
      s("calf", 3, 12, 15, ["seated_calf_raise", "single_leg_calf_raise"]),
      s("hip_abd", 3, 12, 15, ["hip_abduction", "side_plank_leg_lift"]),
      s("push", 3, 6, 10, ["bench_press", "incline_db_press", "push_up"]),
      s("pull_h", 3, 8, 12, ["seated_row", "one_arm_db_row"]),
    ],
  },
  C: {
    id: "C", minutes: 30, extras: ["side_plank_leg_lift", "glute_bridge_single"], slots: [
      s("knee_control", 3, 8, 12, ["step_down", "glute_bridge_single"]),
      s("quad", 3, 30, 45, ["wall_sit", "spanish_squat"]),
      s("shin", 3, 12, 15, ["tibialis_raise"]),
      s("hip_add", 3, 20, 30, ["copenhagen_plank", "hip_adduction"]),
      s("calf", 3, 12, 15, ["seated_calf_raise", "single_leg_calf_raise"]),
      s("core", 3, 10, 12, ["dead_bug", "plank"]),
    ],
  },
};

/** The scheme for an exercise outside a slot (added by hand): what its pattern gets in a template, else 3 × 8–12. */
export function schemeFor(id: string): Scheme {
  const e = exercise(id);
  for (const tpl of Object.values(TEMPLATES)) {
    const slot = tpl.slots.find((x) => x.pattern === e.pattern);
    if (slot) return e.load === "time" ? { sets: 3, low: 20, high: 45 } : slot.scheme.low >= 20 ? { sets: 3, low: 10, high: 15 } : slot.scheme;
  }
  return e.load === "time" ? { sets: 3, low: 20, high: 45 } : { sets: 3, low: 8, high: 12 };
}
