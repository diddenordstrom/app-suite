---
paths:
  - "apps/*/src/client/**"
  - "packages/ui/**"
  - "packages/i18n/**"
---

# UI, strings and colours

- Shared UI goes in `packages/ui`, shared strings in `packages/i18n`. An app keeps only its own look (`tokens.css`, `Logo.tsx`), its domain code and its own i18n dictionaries.
- Every UI string goes through `t()` in both `en` and `sv`. Reuse a key from `packages/i18n/src/shared.ts` before adding one.
- Shared logic returns message keys and params, not text.
- Colours come only from tokens. New tokens use `light-dark()` and must keep text at WCAG AA in both modes.
