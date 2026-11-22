/**
 * Quick entry: several lines of plain text become days, stops, todos and nights.
 *
 *   Huskvarna, fika Kroatorpet, handla ICA      → stop "Huskvarna" with two todos
 *   Gränna, se polkagrisbutiken                  → stop with one todo
 *   dag Gudbrandsdalen                           → starts a new day titled "Gudbrandsdalen"
 *   natt tält Vättern 57.9, 14.5                 → the current day's night: tent at "Vättern" with a position
 *   via Kongsvinger                              → a via point: steers the route, no todos
 *
 * A line may carry "lat, lon" or a long Google Maps link for a position. Bullets pasted from a notes app are ignored.
 * Parsing is pure; applying the commands to a trip is the server's job.
 */
import { coordsFromMapsUrl, type LatLon } from "./geo";
import { CATEGORIES, type Category, type SleepType, type StopKind } from "./plan";

export type QuickCommand =
  | { kind: "day"; title: string }
  | { kind: "night"; sleepType: SleepType | null; name: string | null; lat: number | null; lon: number | null }
  | { kind: "stop"; stopKind: StopKind; name: string; lat: number | null; lon: number | null; todos: { text: string; category: Category }[] };

/** shortLink: a maps.app.goo.gl share link (no position in it). badLink: some other URL without a position. */
export interface QuickWarning { line: number; code: "shortLink" | "badLink" }

export interface QuickResult { commands: QuickCommand[]; warnings: QuickWarning[] }

/** Words that pick a category when they start a todo, besides the category names themselves. */
const ALIASES: Record<string, Category> = {
  handla: "fixa", ica: "fixa", coop: "fixa", tanka: "fixa", bensin: "fixa", ladda: "fixa",
  "äta": "mat", lunch: "mat", middag: "mat", frukost: "mat",
  kaffe: "fika", bageri: "fika",
  "tält": "sova", camping: "sova",
};

const SLEEP_WORDS: Record<string, SleepType> = { "tält": "tent", vandrarhem: "hostel", hotell: "hotel" };

const BULLET = /^(?:[-–—•⁃*·]|\d+[.)])\s+/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Take a position off a line: a Maps URL first, else a bare "lat, lon" with at least 3 decimals. */
function takePosition(s: string): { rest: string; ll: LatLon | null; warning: QuickWarning["code"] | null } {
  let rest = s, ll: LatLon | null = null, warning: QuickWarning["code"] | null = null;
  const u = rest.match(/https?:\/\/\S+/);
  if (u) {
    const url = u[0].replace(/[),.;]+$/, "");
    const found = coordsFromMapsUrl(url);
    if (found === "short") warning = "shortLink";
    else if (found) ll = found;
    else warning = "badLink";
    rest = rest.replace(url, "");
  }
  if (!ll) {
    const c = rest.match(/(-?\d{1,2}\.\d{3,})\s*[,;]\s*(-?\d{1,3}\.\d{3,})/);
    if (c) {
      const lat = Number(c[1]), lon = Number(c[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        ll = { lat, lon };
        rest = rest.replace(c[0], "");
      }
    }
  }
  return { rest, ll, warning };
}

/** One place from free text: a name plus an optional position (coordinates or a long Maps link). Used by "Lägg till". */
export function parsePlace(text: string): { name: string; lat: number | null; lon: number | null; warning: QuickWarning["code"] | null } {
  const p = takePosition(text.trim());
  const name = p.rest.replace(/\s+/g, " ").trim().replace(/^[,;\s]+|[,;\s]+$/g, "");
  return { name: cap(name), lat: p.ll?.lat ?? null, lon: p.ll?.lon ?? null, warning: p.warning };
}

/** "fika Kroatorpet" → fika "Kroatorpet"; "lunch i Lom" → mat "Lunch i Lom"; anything else → se. */
export function parseTodo(seg: string): { text: string; category: Category } {
  const word = seg.split(/\s+/)[0], lw = word.toLowerCase();
  if ((CATEGORIES as readonly string[]).includes(lw) && seg.length > word.length)
    return { text: cap(seg.slice(word.length).trim()), category: lw as Category };
  return { text: cap(seg), category: ALIASES[lw] ?? "se" };
}

export function parseQuick(text: string): QuickResult {
  const commands: QuickCommand[] = [];
  const warnings: QuickWarning[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(BULLET, "").trim();
    if (!line) return;
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^dag\s+(.+)$/i))) {
      commands.push({ kind: "day", title: m[1].trim() });
      return;
    }

    if ((m = line.match(/^natt\s+(.+)$/i))) {
      let rest = m[1].trim();
      const first = rest.split(/\s+/)[0].toLowerCase();
      const sleepType = SLEEP_WORDS[first] ?? null;
      if (sleepType) rest = rest.slice(first.length).trim();
      const p = takePosition(rest);
      if (p.warning) warnings.push({ line: i + 1, code: p.warning });
      const name = p.rest.replace(/\s+/g, " ").trim().replace(/[,;]+$/, "").trim();
      commands.push({ kind: "night", sleepType, name: name || null, lat: p.ll?.lat ?? null, lon: p.ll?.lon ?? null });
      return;
    }

    if ((m = line.match(/^via\s+(.+)$/i))) {
      const p = parsePlace(m[1]);
      if (p.warning) warnings.push({ line: i + 1, code: p.warning });
      if (p.name) commands.push({ kind: "stop", stopKind: "via", name: p.name, lat: p.lat, lon: p.lon, todos: [] });
      return;
    }

    const p = takePosition(line);
    if (p.warning) warnings.push({ line: i + 1, code: p.warning });
    const segs = p.rest.split(",").map((x) => x.trim()).filter(Boolean);
    const name = segs[0]?.replace(/^stopp?\s+/i, "").trim();
    if (!name) return;
    commands.push({
      kind: "stop", stopKind: "stop", name: cap(name), lat: p.ll?.lat ?? null, lon: p.ll?.lon ?? null,
      todos: segs.slice(1).map(parseTodo),
    });
  });
  return { commands, warnings };
}

/** Counts for the "Added 2 stops, 3 todos" message. */
export function summarize(r: QuickResult) {
  let days = 0, stops = 0, vias = 0, todos = 0, nights = 0;
  for (const c of r.commands) {
    if (c.kind === "day") days++;
    else if (c.kind === "night") nights++;
    else if (c.stopKind === "via") vias++;
    else { stops++; todos += c.todos.length; }
  }
  return { days, stops, vias, todos, nights };
}
