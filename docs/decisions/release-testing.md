---
title: Test the release, not only the code, before it reaches main
summary: Proposed CI gates now that Dependabot merges weekly and the apps have real users - image smoke test on PRs, checked deploys, E2E smoke per app, migrations against old data
type: decision
status: open
updated: 2026-11-11
---

# Test the release, not only the code, before it reaches main

Proposed in a chat with the user (Nov 2026) right after Dependabot was added. Not built yet.

## Problem

Unit tests cover each app's logic well, but what breaks on a dependency bump is mostly outside them:

- The Docker image is built only after a merge to `main` (the `image` job runs on push). A new base image or native module (the Node 22 → 26 bump with `better-sqlite3`) is first exercised in production.
- `deploy` only sends the Komodo webhook. It is green even if an app never comes up.
- Only `apps/garden` has E2E tests (Playwright). The other apps have almost no client tests.
- Migrations are only tested on fresh databases, never on one created by an earlier release.

Dependabot now opens PRs every week, and other people use Fartlek, so a broken release reaches someone else's data.

## Proposed, in order of value

1. **Build and start the image on every PR.** A PR job builds the image without pushing, starts each app against an empty `/data` and polls `/api/health` until it answers or times out. It catches a wrong base image, files missing from `COPY` in the [Dockerfile](../../Dockerfile), native modules that don't load and migrations that crash on startup. It becomes a required check (see Related).
2. **Deploys that check themselves.**
   - A `healthcheck` per service in [deploy/compose.yml](../../deploy/compose.yml), so Komodo shows an app that didn't come up.
   - After the webhook, `deploy` polls each public `/api/health` and fails if one doesn't answer.
   - Images are also tagged with the commit sha next to `latest`, so a rollback is pointing the stack at the previous sha. See [deploy-komodo](deploy-komodo.md).
3. **E2E smoke test per app.** A few Playwright flows per app through demo mode ([demo-mode](demo-mode.md)), so no Garmin key or account is needed: start a demo, open each main page, fail on console errors or failed API calls. Not full coverage; garden keeps its own suite.
4. **Migrations against old data.** For apps with data (Fartlek, Kvitt, Etapp, garden): keep a database made by the previous release's schema and demo data as a fixture, run the current migrations on it, and check that rows and user-entered fields are still there. Needed before the Fartlek activity-detail rework and its full resync ([fartlek-structured-workouts](fartlek-structured-workouts.md)).

## Passed over

- Component tests and coverage floors for the apps other than garden: costly to keep up for what they catch; the E2E smoke covers the pages.
- A staging environment: one homelab and few users; the PR image test and checked deploys cover most of what staging would catch.

## Related: required checks and auto-merge

- The repo is private on GitHub Free, which has no branch protection, rulesets or auto-merge. So nothing makes CI required before a merge, and an auto-merge workflow merges at once (in the self-sufficiency-garden repo, Dependabot PRs were merged within seconds, before CI, including red ones).
- Making the repo public enables both for free. Then `test`, `docs`, `audit`, `garden` and the image smoke test become required checks on `main` (with the owner as bypass for direct pushes), and Dependabot minor/patch PRs can auto-merge once green; majors stay manual.
- Auto-merge enabled with the workflow's `GITHUB_TOKEN` merges as the bot, and those commits start no workflows, so nothing would build or deploy. It needs a fine-grained token (merge rights on this repo only) or a GitHub App as a secret.

## Open

- Whether to make the repo public. Before that, scan the full git history for secrets (gitleaks) and review what `deploy/` and `docs/` reveal.
- Whether a Dependabot merge should deploy at once (token as above) or ride along with the next manual push.
- The self-sufficiency-garden repo still auto-merges Dependabot PRs without waiting for CI; fix or archive it now that garden lives here.
