---
title: Kvitt never shows an empty list
summary: A list with nothing left to buy goes away: archived (soft-deleted) when trip history needs it, deleted otherwise
type: decision
status: accepted
updated: 2026-11-10
---

# Kvitt never shows an empty list

## Decision

A shopping list exists to be shopped, so the lists page never shows an empty one:

- **Everything bought** (at checkout): the list is **archived** (`lists.archived_at`, a soft delete). It is gone from the lists page and can't be picked for a new trip, but the closed trip still shows what was bought from it.
- **Last item deleted** by the owner: the list is deleted outright when nothing on it was ever bought (no history to keep), archived otherwise.
- **A new list closed without adding anything** is deleted when the owner closes it.
- **A list in an active trip is left alone**, even with nothing open on it, since the shopper may still be working through it; checkout decides.
- Migration `0001_archive_empty_lists` archives lists that already had only bought items left.

The rule lives in `removeIfDone` in [apps/kvitt/src/server/listStore.ts](../../apps/kvitt/src/server/listStore.ts).

## Reasons

- An empty card ("Tom") is noise: the owner adds a new list when there is something to buy.
- A hard delete of a fully bought list would cascade to its bought items and erase what each trip bought, so those lists are archived instead of deleted.
