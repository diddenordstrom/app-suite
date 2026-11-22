---
title: Skymning depth: soft cards and controls, big shadow only for floating things
summary: The suite look: soft depth, Geist + Newsreader, the dusk horizon in a few places, chart areas and paper grain
type: decision
status: accepted
updated: 2026-11-22
---

# Skymning depth

## Decision

Depth comes in three steps, all tokens in [skymning.css](../../packages/ui/src/skymning.css), so every app gets them through `packages/ui`:

- **Page:** flat.
- **Cards** (`shadow-card`, edge `border-card-edge`): a faint edge and a thin shadow. They sit still on the page. A card with `onClick` lifts to `shadow-card-hover` on hover, so the shadow hints that it can be pressed.
- **Controls** (`shadow-control` on outline buttons and the chosen tab of `SegmentedControl`, `shadow-primary` on the primary button): a thin shadow and, in dark mode, the light top edge, at the same soft level as cards. A stronger lift with a coloured glow under the primary button was tried and dropped as too much. Outline buttons and the chosen tab sit on `--control` (white in light, a step lighter than cards in dark).
- **Floating things** (`shadow-pop`): dialogs, menus, tooltips, the tour card. Tailwind's own `shadow-sm` maps to the control step and `shadow-md/lg/xl` to the pop step, so menus and toasts written with those follow along.

Light mode tints the shadows plum (the foreground colour), not black, so they melt into the warm paper. Dark mode adds a 1px light top edge (`--highlight`) and deeper shadows, since a plain shadow barely shows on a dark ground.

## Reasons

- Compared on a canvas (flat / soft / lifted, light and dark). "Lifted" cards looked good with three cards but Fartlek's Home and Trends hold 6–10 cards each: when everything floats the shadow stops meaning anything, and borderless white cards wash out against the light paper.
- Flat (the old look) made buttons, tabs and cards look alike; the soft shadow and the white control surface are enough to tell them apart.
- Hand-built panels in the apps that copied the card classes (`rounded-lg border border-border bg-card`) were switched to the same card depth so they match `Card`.

Gradients are a separate, later step.

## The rest of the look (same day)

After the depth, two directions were mocked on the same canvas ("typsnitt + horisont" and "grafer + papper") and both were kept:

- **Type:** Geist for text and UI, Newsreader (variable, with optical sizes) for page titles inside the app shell, `Stat` values, ring centres and the big Dagsform score; its italic for the verdict. Nunito is gone from every app; Etapp keeps Barlow Condensed for its road-sign numbers.
- **The horizon** (`--horizon`, lavender into the app's signature) only in a few places: every app's logo tile (`MarkTile`), the top line of a hero card (`<Card horizon>`, used on Fartlek's Idag), the active nav marker and the arc of `Ring`.
- **Charts:** `LineChart` series can take `area` (a fill fading out under the line), used for fitness on Fartlek's Home and Trends.
- **Paper:** an almost invisible grain over the page in light mode, a faint glow at the top in dark mode (`--paper-grain`, `--paper-glow`).

Passed over: glass effects, gradients on buttons and sparkle icons, which read as a generic AI product. The app icons (favicons, `apple-touch-icon.png`, the manifest PNGs) carry the same horizon as `MarkTile`; static files cannot read CSS, so each icon holds its app's end colour as a hex (the same oklab mix, light mode).
