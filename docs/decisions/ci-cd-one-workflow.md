---
title: CI and CD share one workflow, named ci-cd
summary: Why test and deploy jobs live in the same workflow file instead of separate ci and cd workflows
type: decision
status: accepted
updated: 2026-11-24
---

# CI and CD share one workflow, named ci-cd

## Decision

[`ci.yml`](../../.github/workflows/ci.yml) holds both the CI jobs (`audit`, `docs`, `test`, `smoke`) and the CD jobs (`image`, `deploy`). The workflow is named `ci-cd`, so checks read `ci-cd / test`, `ci-cd / deploy` and so on. It used to be named `ci`, which made the deploy jobs look like part of CI.

## Why one workflow

- Within a workflow, `needs:` chains the jobs: `image` waits on `audit` and `test`, `deploy` waits on `image`. A failing test or audit therefore never builds or ships an image (see [ci-audit-gate.md](ci-audit-gate.md)).
- Split into `ci.yml` and `cd.yml`, the CD workflow would have to start from `workflow_run`. That fires when CI finishes whatever the result, so it must check the conclusion itself; it runs in the default branch's context; and one commit's path from test to deploy is spread over two runs.

## Consequences

- On pull requests `image` and `deploy` show as skipped; `image` runs on push only, `deploy` on push to `main` only.
- The file keeps its name `ci.yml`, so links to it still work.
- Required status checks on `main` match job names (`audit`, `docs`, `test`, `smoke (<app>)`), not the workflow name, so the rename does not touch branch protection (see [dependabot-automerge.md](dependabot-automerge.md)).
