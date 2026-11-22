---
title: Skymning depth: soft cards and controls, big shadow only for floating things
summary: The three shadow steps every app shares, why cards stay soft, and how dark mode gets depth
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
