# docs: the app-suite wiki

Decisions, open questions and notes for the whole suite, kept where every agent session can reach them (this repo) instead of on one computer. The aim is that a fresh session can find what was decided and why without rereading old chats.

## What belongs here

- **Decisions and their reasons**, including what was passed over. This is the main content.
- **Open questions** with who or what they wait on.
- **State of an app** only when it goes beyond the app's README (the README stays the how-to).
- **Research** that informed a decision.

Leave out anything the code or a README already says, chat transcripts and step-by-step progress. If handing the wiki to someone with amnesia would not need it, it stays out.

## Layout

```
docs/
  CLAUDE.md        this file (the schema: how to work in docs/)
  index.md         generated catalog, read it first (never edit by hand)
  log/YYYY-MM.md   append-only log, one file per month
  decisions/       one page per decision, named by slug
  apps/            optional per-app state pages
  raw/             immutable sources (clippings, exports); read, never edit
```

## Page format

Every page outside `log/` and `raw/` starts with frontmatter; the index is built from it.

```
---
title: Short, specific title
summary: One line saying what the page answers
type: decision | app | note | research
status: accepted | open | superseded   (optional)
updated: YYYY-MM-DD
---
```

Write in English like the rest of the repo; keep Swedish names and quotes as they are. Link to other pages and to code with relative links, and to a related decision instead of repeating it.

## Working in the wiki

**Orient.** Read `docs/index.md`, then only the pages it points to. For recent history: `grep -h "^## \[" docs/log/*.md | tail -10` (or just read the "Recent activity" section of the index).

**Capture.** When a session settles something (a decision, a changed constraint, an answered or new open question):
1. Extend the page that already covers it. Search first; create a new page only for a new subject.
2. Never silently overwrite a decision. Set the old one to `status: superseded` and link to the new page, which explains the change.
3. Add one entry to the current `docs/log/YYYY-MM.md`.
4. Run `npm run docs:index` and commit the result with the pages.

**Log entries** go at the bottom of the file, in this exact form, followed by one to three lines:

```
## [2026-11-09] decision | Short title
```

Kinds: `ingest` (new source or page), `decision`, `query` (an answer worth keeping), `lint`, `note`. If two branches both append and git conflicts, keep both entries.

**Query.** Answer from the pages and cite them. When an answer is worth keeping (a comparison, an analysis), file it back as a page.

**Lint.** Now and then, read through for contradictions, stale claims, decisions that were overtaken but not marked superseded, and subjects mentioned but missing a page. `npm run docs:check` only verifies structure (frontmatter, links, log format, index up to date); the content check is a judgement call. Record a lint pass in the log.

## Commits and CI

- Docs commits start with 📝 (gitmoji, like the rest of the repo), one commit per session rather than per page. Code history without docs: `git log --invert-grep --grep='^📝'`.
- `npm run docs:check` is part of `npm run check` and runs as its own CI job. Docs-only changes skip the app tests and image builds; the dependency audit always runs.
