import { addDays, weekday, type ISODate } from "./dates";
import { STRIDES } from "./steps";
import type { Msg, WorkoutType } from "./types";

/**
 * Block text, the old quick-add syntax kept (D8): one line per week.
 *   `6 zone 2, 9 tröskel, 15 long run`   sessions (`,` or `;`)
 *   `15 long run zone 2`                  long run scored as easy
 *   `45min easy`                          duration instead of distance
 *   `4 20`                                totals only: 4 runs, 20 km (weekly target)
 *   `9.8 tröskel (3x8 min @tröskel / 2 min jogg)`  steps inline (shared/steps.ts); the amount comes from them
 *   `8 easy + strides`, `8 lugnt + 8 strides`  an easy run with strides at the end (default 6 × 20 s / 1 min jog)
 *   `... backoff` / `avlastning`          backoff week
 *   `-` (or an empty line)                a week with nothing planned
 * Distances are in the user's unit; decimal comma allowed. A leading `✓` marks a finished week.
 */
export interface ParsedSession {
  type: WorkoutType;
  distance: number | null;
  durationMin: number | null;
  zone2: boolean;
  /** The step text inside `( … )` after the session (shared/steps.ts grammar), when written inline. */
  stepsText?: string;
  /** A trailing `*`: keep the workout's steps as they are. */
  star?: boolean;
}
export interface ParsedWeek { sessions: ParsedSession[]; totals: { runs: number; distance: number } | null; backoff: boolean; errors: Msg[] }

const ALIASES: [RegExp, WorkoutType, boolean?][] = [
  [/^(long run|long|lång|långpass|langpass|lr)\s+(zone ?2|zon ?2|z2)$/, "long", true],
  [/^(easy|zone ?2|zon ?2|z2|lugnt|lugn|lätt|latt|distans|recovery|återhämtning)$/, "easy"],
  [/^(threshold|tröskel|troskel|tempo|thr)$/, "threshold"],
  [/^(long run|long|lång|långpass|langpass|lr)$/, "long"],
  [/^(intervals?|intervall(er)?|int|vo2|fartlek)$/, "intervals"],
  [/^(race|lopp|tävling)$/, "race"],
  [/^(cross|cross-?train(ing)?|other|bike|cykel|cykling|swim|sim|simning|annat|annan träning)$/, "cross"],
  [/^(strength|styrka|gym|styrketräning)$/, "strength"],
  [/^(rest|vila)$/, "rest"],
];
const BACKOFF = /\b(backoff|back-off|vila vecka|avlastning(svecka)?)\b/i;

/** Split a line into sessions on `,` or `;`, but not inside `( … )` or in a decimal comma (`6,5`). */
export function splitSessions(text: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    const decimal = ch === "," && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "");
    if (depth === 0 && (ch === ";" || (ch === "," && !decimal))) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseType(s: string): { type: WorkoutType; zone2: boolean } | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return { type: "easy", zone2: false };
  for (const [re, type, z2] of ALIASES) if (re.test(t)) return { type, zone2: !!z2 };
  return null;
}

const num = (s: string) => Number(s.replace(",", "."));

/** `+ strides` / `+ 8 stegringar` at the end of a session, outside any `( … )`. */
const STRIDES_TAIL = /\s*\+\s*(?:(\d+)\s*(?:x|×)?\s*)?(strides|stride|stegringar|stegring|stegringslopp)\s*$/i;

/** The step text for `<amount> + strides`: the run, then the strides (both languages are read back). */
export function stridesStepsText(amount: { distance: number | null; durationMin: number | null }, reps: number): string {
  const run = amount.durationMin != null ? `${amount.durationMin} min` : String(amount.distance);
  return `${run} easy, ${reps}x${STRIDES.sec} s strides / ${STRIDES.restMin} min jog`;
}

export function parseWeekLine(line: string): ParsedWeek {
  const out: ParsedWeek = { sessions: [], totals: null, backoff: false, errors: [] };
  let text = line.trim().replace(/^✓\s*/, "");
  const outside = text.replace(/\([^)]*\)/g, "");
  if (BACKOFF.test(outside)) {
    out.backoff = true;
    text = text.replace(/\.{0,3}\s*\b(backoff|back-off|vila vecka|avlastning(svecka)?)\b(?![^(]*\))/gi, "").trim();
  }
  if (!text || /^[-–—]$/.test(text)) return out;
  const totals = text.match(/^(\d+)\s+(\d+(?:[.,]\d+)?)$/);
  if (totals) {
    out.totals = { runs: Number(totals[1]), distance: num(totals[2]) };
    return out;
  }
  for (let raw of splitSessions(text)) {
    // `8 lugnt + strides`: an easy run (or long run) with strides at the end, written as steps.
    let strides: number | null = null;
    const tail = raw.includes("(") ? null : raw.match(STRIDES_TAIL);
    if (tail) {
      strides = tail[1] ? Number(tail[1]) : STRIDES.reps;
      if (strides < STRIDES.minReps || strides > STRIDES.maxReps) { out.errors.push({ key: "parse.badStrides", params: { text: raw.trim(), min: STRIDES.minReps, max: STRIDES.maxReps } }); continue; }
      raw = raw.slice(0, tail.index).trim();
    }
    // Steps written inline: `9.8 tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt)`.
    const paren = raw.match(/^(.*?)\s*\(([^)]*)\)\s*(\*)?$/);
    if (raw.includes("(") && !paren) { out.errors.push({ key: "parse.cantRead", params: { text: raw } }); continue; }
    const star = /\*\s*$/.test(raw);
    const part = (paren ? paren[1] : raw).trim().replace(/\s*\*$/, "");
    const stepsText = paren ? paren[2].trim() : undefined;
    const extra = { ...(stepsText ? { stepsText } : {}), ...(star ? { star } : {}) };
    const dur = part.match(/^(\d+(?:[.,]\d+)?)\s*(min|m|minutes|minuter)\b\s*(.*)$/i);
    const dist = part.match(/^(\d+(?:[.,]\d+)?)\s*(km|mi|k)?\s*(.*)$/i);
    const bare = parseType(part);
    const before = out.sessions.length;
    if (stepsText) {
      const t = parseType(dur ? dur[3] : dist ? dist[3] : part);
      if (!t) { out.errors.push({ key: "parse.unknownType", params: { text: part } }); continue; }
      out.sessions.push({ type: t.type, distance: !dur && dist ? num(dist[1]) : null, durationMin: dur ? num(dur[1]) : null, zone2: t.zone2, ...extra });
    } else if (dur) {
      const t = parseType(dur[3]);
      if (!t) { out.errors.push({ key: "parse.unknownType", params: { text: dur[3] } }); continue; }
      out.sessions.push({ type: t.type, distance: null, durationMin: num(dur[1]), zone2: t.zone2, ...extra });
    } else if (dist) {
      const t = parseType(dist[3]);
      if (!t) { out.errors.push({ key: "parse.unknownType", params: { text: dist[3] } }); continue; }
      out.sessions.push({ type: t.type, distance: num(dist[1]), durationMin: null, zone2: t.zone2, ...extra });
    } else if (bare && (bare.type === "rest" || bare.type === "cross" || bare.type === "strength")) {
      out.sessions.push({ type: bare.type, distance: null, durationMin: null, zone2: false });
    } else {
      out.errors.push({ key: "parse.cantRead", params: { text: part } });
    }
    if (strides != null && out.sessions.length > before) {
      const ses = out.sessions[out.sessions.length - 1];
      if ((ses.type !== "easy" && ses.type !== "long") || (ses.distance == null && ses.durationMin == null)) {
        out.sessions.pop();
        out.errors.push({ key: "parse.stridesOnEasy", params: { text: part } });
      } else {
        ses.stepsText = stridesStepsText(ses, strides);
      }
    }
  }
  return out;
}

/** Split block text into week lines; trailing empty lines go. */
export function blockLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  while (lines.length && !lines.at(-1)) lines.pop();
  return lines;
}

export function parseBlock(text: string): ParsedWeek[] {
  return blockLines(text).map(parseWeekLine);
}

/**
 * Place a week's sessions on days (D11: the day is only a preference).
 * Long runs go on the long-run day when it is a usual run day, else on the last usual run day; the rest
 * fill the usual days in order, then spill over to other days. `taken` days already hold a session and are used last.
 */
export function placeSessions(weekStart: ISODate, sessions: Pick<ParsedSession, "type">[], runDays: number[], taken: Iterable<ISODate> = [], longRunDay?: number): ISODate[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const preferred = days.filter((d) => runDays.includes(weekday(d)));
  const others = days.filter((d) => !runDays.includes(weekday(d)));
  const pool = [...preferred, ...others];
  const result: ISODate[] = new Array(sessions.length);
  const used = new Set<ISODate>(taken);
  const longIdx = sessions.map((s, i) => (s.type === "long" ? i : -1)).filter((i) => i >= 0);
  for (const i of longIdx) {
    const own = longRunDay != null ? preferred.find((x) => weekday(x) === longRunDay && !used.has(x)) : undefined;
    const d = own ?? [...preferred].reverse().find((x) => !used.has(x)) ?? pool.find((x) => !used.has(x)) ?? days[6];
    result[i] = d;
    used.add(d);
  }
  sessions.forEach((_, i) => {
    if (result[i]) return;
    const d = pool.find((x) => !used.has(x)) ?? days[i % 7];
    result[i] = d;
    used.add(d);
  });
  return result;
}
