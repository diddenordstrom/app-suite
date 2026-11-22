---
title: CI always audits production dependencies
summary: The audit job runs on every push and PR, independent of what changed, with the same gate as the garden repo
type: decision
status: accepted
updated: 2026-11-09
---

# CI always audits production dependencies

## Decision

The `audit` job in `.github/workflows/ci.yml` runs on every push and pull request and fails on high or critical advisories in production dependencies (`npm audit --audit-level=high --omit=dev`). It reads `package-lock.json`, so it needs no install. It is the same gate as in the self-sufficiency-garden repo, which is the reference for how CI gates are done here.

## Consequences

- The audit is never skipped by a path filter, not even for docs-only changes: a new advisory can turn a green main red regardless of what a commit touched.
- Other jobs may skip work when only `docs/` changed (see [the docs wiki decision](docs-wiki-in-monorepo.md)). The audit job does not take part in that.
- Image builds depend on the audit passing, so a vulnerable dependency never ships.
