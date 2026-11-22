---
title: The wiki lives in docs/ of the monorepo
summary: Why notes and decisions are kept in this repo, how index and log work, and when to split them out
type: decision
status: accepted
updated: 2026-11-09
---

# The wiki lives in docs/ of the monorepo

## Context

The notes started as a local LLM wiki (index, log and pages maintained by an agent, after Karpathy's "LLM wiki" pattern) on a computer that is rarely used. Day-to-day work happens in the Claude app and in the browser, which reach GitHub repositories but not that computer.

## Decision

- Notes and decisions go in `docs/` of this repo. Conventions for agents are in [docs/CLAUDE.md](../CLAUDE.md).
- `docs/index.md` is **generated** from page frontmatter by `scripts/docs-index.mjs`, so parallel sessions cannot conflict on it and it cannot drift from the pages.
- The log is one append-only file per month (`docs/log/YYYY-MM.md`) with greppable headings, instead of a single ever-growing file.
- Only decisions, reasons and open questions go in, not everything said in a session. A large compiled wiki costs more to keep right than it saves unless it holds what is hard to rediscover.

## Consequences

- Docs commits are noise in `git log`. They start with 📝 so code history is one `--invert-grep` away, and they are made once per session.
- CI skips app tests and image builds for docs-only changes; the dependency audit and the docs check still run. See [the audit gate](ci-audit-gate.md).
- Personal or cross-project notes that are not about this suite do not belong here.

## Open questions

- Whether cross-project notes (garden, research, travel) get their own repo. Revisit when they start to outweigh the app-suite notes; pages move with plain `git mv` and the same conventions.
