---
paths:
  - "apps/*/src/client/**"
  - "apps/*/vite.config.ts"
---

# Vite gotchas

- Vite serves client modules by URL, so never name a client root file after a route (`settings.tsx` vs `/settings`).
- Proxy `"/api/"` with the trailing slash.
