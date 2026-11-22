---
title: Swedish app names: runplan became Fartlek, shopsplit became Kvitt
summary: Why the two English-named apps were renamed, what changed and which old names were kept on purpose
type: decision
status: accepted
updated: 2026-11-10
---

# Swedish app names: Fartlek and Kvitt

## Decision

The suite's apps get Swedish names, like Etapp, Brygga and Autarki:

- **runplan → Fartlek** (`apps/fartlek`, `ghcr.io/diddenordstrom/fartlek`, `fartlek.didrik.dev`). Fartlek is a Swedish word ("speed play") that runners everywhere already use.
- **shopsplit → Kvitt** (`apps/kvitt`, `ghcr.io/diddenordstrom/kvitt`, `kvitt.didrik.dev`). "Vi är kvitt" is what the app helps a household get to; the app already said "Ni är kvitt" when balances are settled.
- **Autarki (garden) keeps its name**; it is already Swedish, and garden is to be ported to the suite's stack later anyway.

Everything a person sees changed: folders, package and image names, hostnames, the name in the app, the PWA manifest and the portfolio.

## Kept on purpose

The smallest possible change on marvin:

- **Data folders** stay `${DATA_DIR}/runplan` and `${DATA_DIR}/shopsplit` (mounted by the new services), so nothing moves on disk and `backup.sh` is unchanged.
- **Komodo variables** stay `RUNPLAN_*` and `SHOPSPLIT_*`, so no secret is recreated. That includes the env name `RUNPLAN_MASTER_KEY`, and the salt `runplan:v1:` in server-kit's `createCipher`: changing either would make stored Garmin keys unreadable.
- **Old hostnames redirect** (Traefik `redirectregex`, permanent) to the new ones with path and query, so bookmarks, invite links and recovery links keep working.
- The Pocket ID clients stay; only their callback URLs change.

## What people notice

Cookies and browser storage belong to a hostname, so after the switch everyone signs in once more and picks theme and language again. Kvitt members without an account open their recovery link once (old links redirect). An installed PWA has to be installed again from the new address.
