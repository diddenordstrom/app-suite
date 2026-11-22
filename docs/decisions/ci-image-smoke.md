---
title: CI starts every app's image on pull requests
summary: A smoke job builds each image and waits for /api/health, because tests run the source and never the production bundle
type: decision
status: accepted
updated: 2026-11-22
---

# CI starts every app's image on pull requests

## Decision

The `smoke` job in [ci.yml](../../.github/workflows/ci.yml) builds each app's image on every pull request, starts it in production mode with dummy settings and waits up to 30 s for `/api/health`. It skips an app whose files, a shared package, the lockfile, the Dockerfile or `scripts/` did not change, and still succeeds then, so it can be a required check.

## Why

On 2026-11-22 the images built after the move to the public repo crashed at start for garden, brygga, portfolio and etapp: `Dynamic require of "tty" is not supported`. Unit tests, lint and the build all passed, because they never run the bundled server.

The cause was in `scripts/build-server.mjs`. It marks only the app's own `dependencies` as external, and bundles `@homelab/*` packages as source. `server-kit` imports `web-push` (a peer dependency), which only Fartlek lists. In every other app esbuild inlined `web-push`, its `https-proxy-agent` and `debug`, and `debug`'s CommonJS `require("tty")` cannot run in an ESM bundle. The build now also treats the dependencies and peer dependencies of every workspace package as external; the image already has them in `node_modules`.

It was not a Dependabot bump: it comes from the shared Web Push change, and Fartlek hid it.

## Passed over

- **Smoke test after the push:** by then `latest` is already overwritten and Komodo is about to pull it. A pull request is the cheaper place to stop it.
- **A Docker health check in the Compose file:** would flag a crash loop after the fact, not stop the merge.
