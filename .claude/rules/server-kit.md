---
paths:
  - "apps/*/src/server/**"
  - "packages/server-kit/**"
---

# Server code

- Shared server code (sign-in, demo mode, SQLite bootstrap, secret encryption) goes in `packages/server-kit`. An app writes none of the sign-in itself: use `createAuth`.
- Anything that leaves the database file (uploads to disk, outside APIs, keys) must be turned off when `authMode === "demo"`.
