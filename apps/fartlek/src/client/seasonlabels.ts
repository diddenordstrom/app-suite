/**
 * Which race flags on the season strip (pages/Blocks.tsx) get their name next to the ⚑.
 * A flag left of `FLIP_AT` % writes its label to the right, the rest to the left, so two labels can
 * run into each other from either side. Widths are estimates from the name's length (text-xs, semibold).
 */
export const FLIP_AT = 70;
const GLYPH_PX = 14; // "⚑ " plus the left-1/right-1 offset
const CHAR_PX = 6.6;
const MAX_PX = 160; // max-w-40 on the label
const GAP_PX = 6;

export const labelRight = (pos: number) => pos <= FLIP_AT;

/**
 * `flags`: position on the strip in % and the race name, in date order; `widthPx`: the strip's width.
 * The latest race wins a clash (it is usually the goal race), so flags are decided from the last one back:
 * a name shows only if it covers no other flag and no name already shown.
 */
export function raceLabels(flags: { pos: number; name: string }[], widthPx: number): boolean[] {
  if (widthPx <= 0) return flags.map(() => false);
  const span = (pos: number, px: number): [number, number] => {
    const w = (px / widthPx) * 100;
    return labelRight(pos) ? [pos, pos + w] : [pos - w, pos];
  };
  const gap = (GAP_PX / widthPx) * 100;
  const hits = (a: [number, number], b: [number, number]) => a[0] < b[1] + gap && b[0] < a[1] + gap;
  const glyphs = flags.map((f) => span(f.pos, GLYPH_PX));
  const shown: [number, number][] = [];
  const out = flags.map(() => false);
  for (let i = flags.length - 1; i >= 0; i--) {
    const label = span(flags[i].pos, Math.min(MAX_PX, GLYPH_PX + flags[i].name.length * CHAR_PX));
    if (glyphs.some((g, j) => j !== i && hits(label, g)) || shown.some((s) => hits(label, s))) continue;
    out[i] = true;
    shown.push(label);
  }
  return out;
}
