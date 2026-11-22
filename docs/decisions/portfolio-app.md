---
title: Portfolio is a static app in the suite
summary: apps/portfolio presents the apps and links to <app>.didrik.dev and blog.didrik.dev; it shows the apps, not the source
type: decision
status: accepted
updated: 2026-11-20
---

# Portfolio is a static app in the suite

## Decision

`apps/portfolio` is its own app in the monorepo (Hono server serving a React/Vite page, no database, no secrets) using the shared Skymning design. It briefly describes Etapp, runplan, shopsplit, Autarki (garden) and Brygga and links to `<app>.didrik.dev` and `blog.didrik.dev`. Copy lives in its own en/sv dictionaries. Design B ("Showcase") was chosen from three mockups.

## Reasons

- The page has no GitHub or source links: it is about using the apps, not reading their code. This was first because the apps were closed source; they are [open source now](open-source.md), and the page still leaves the code out.
- Self-hosting at home is a cost choice (cheapest), but the apps are built for several people to use. The page highlights self-hosting and the push-to-live release pipeline (CI, ghcr.io image, Komodo; Watchtower until [deploy-komodo](deploy-komodo.md)).
- Autarki's logo was redrawn as a sprout on the suite's lavender brand tile so it fits next to the other marks.

- The portfolio is served at the apex `didrik.dev` (Cloudflare Tunnel hostname -> `http://portfolio:3000`), not `portfolio.didrik.dev` plus a redirect: it is the front door and needs no extra hostname.
- The pipeline copy says the apps run on "my own server at home" (first person is fine).
- Fartlek has its own landing page at `/fartlek`, and its card links there with "Läs mer": see [fartlek-landing-page](fartlek-landing-page.md).
