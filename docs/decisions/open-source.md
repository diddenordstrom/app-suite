---
title: app-suite is open source under MIT, with the wiki included
summary: Why the repo went public, what was scrubbed first (home coordinates, homelab services outside the suite), why docs/ stays in the repo, and what stays private
type: decision
status: accepted
updated: 2026-11-13
---

# app-suite is open source under MIT, with the wiki included

## Decision

- The whole monorepo is public under the **MIT licence** (root `LICENSE`, same terms Autarki already had in `apps/garden/LICENSE`).
- **docs/ stays in the repo.** The decisions, research and log are about the apps, not about the owner, and they explain why the code looks the way it does. Public decision records are a plus for a portfolio project.
- The portfolio still has no GitHub or source links: it shows the apps, not the code (see [portfolio-app](portfolio-app.md)).

## Scrubbed before going public

- **Etapp's home coordinates.** Demo data, tests and the Settings placeholder used a real home position; they now use central Jönköping (57.7826, 14.1618), and that position was removed from the quick-pick list. The public repo starts from fresh history, so the old position is gone from history too.
- **Homelab services outside the suite** are not mentioned anywhere. Komodo, Traefik, Pocket ID and the `didrik.dev` hostnames (including `sso.`) may be: they are what the release pipeline is built on and the portfolio talks about it.
- **Docs and fixtures** no longer say who uses an app, name a colleague or friends, mention personal races, or link to private claude.ai canvases; the Fartlek planning scenario named after the owner is now "dip and return".
- **The owner's email address** is not in any file. The old repo's history carries it in every commit, so the public repo starts as a fresh repository with one squashed initial commit under the GitHub noreply address; the old repo stays private.
- No secrets were ever committed: they live in Komodo variables and GitHub secrets, `.env` and `data/` are gitignored, and the history was checked for keys, tokens and real `.env` values.

## Reasons

- The [roadmap](fartlek-roadmap.md) leaned towards open source before any money; a public repo is the cheapest way to find out if anyone wants a hosted Fartlek.
- Public repos get unlimited GitHub Actions minutes, which ends the minute shortage that led to the [Komodo build path](deploy-komodo.md).
- Moving the wiki to a separate private repo was passed over: agents would lose the decisions next to the code, and nothing in it needs hiding. It stays the rule (from [docs-wiki-in-monorepo](docs-wiki-in-monorepo.md)) that personal or cross-project notes do not go here.

## What this means from now on

- Anything committed is public, docs included. No real places, health data, finances, names of people (colleagues, friends, family), who uses an app, real races or training history, or homelab services outside the suite in code, fixtures, tests or docs. Demo and test data are invented or generic.
- Fixtures from real runs keep only what the tests need (laps, HR, speed, altitude); never GPS tracks.
