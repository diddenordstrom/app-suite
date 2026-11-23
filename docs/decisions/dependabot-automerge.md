---
title: Dependabot auto-merge when the checks pass
summary: How non-major Dependabot PRs merge themselves, and the repo settings the workflow depends on
type: decision
status: accepted
updated: 2026-11-23
---

# Dependabot auto-merge when the checks pass

## Decision

[`.github/workflows/dependabot-automerge.yml`](../../.github/workflows/dependabot-automerge.yml) runs on Dependabot PRs and enables GitHub's auto-merge (squash) for everything except semver-major updates. The weekly `minor-patch` and `actions` groups, security PRs and single patch bumps therefore merge on their own; major bumps stay open for a manual review, as [`dependabot.yml`](../../.github/dependabot.yml) intends.

The workflow only *asks* for the merge. GitHub performs it once every required check is green, so the gate is branch protection, not the workflow.

## Settings it depends on (not in git)

- Settings → General → Pull Requests: **Allow auto-merge** on.
- Branch protection or ruleset on `main` with **Require status checks to pass**: `audit`, `docs`, `test` and the six `smoke (<app>)` jobs from [`ci.yml`](../../.github/workflows/ci.yml). Without a required check, auto-merge merges immediately.

## Why

One lockfile bump a week should not need a person when CI already proves it builds, passes the tests and starts in the production image ([ci-image-smoke](ci-image-smoke.md), [ci-audit-gate](ci-audit-gate.md)).

## Open

- While Actions minutes are used up on the private repo, CI jobs fail at once with no runner, so required checks never go green and nothing auto-merges. Turn the required checks on once CI runs again (or on the public repo).
- A merged bump lands on `main` but is not released: releases stay manual in Komodo ([deploy-komodo](deploy-komodo.md)).
