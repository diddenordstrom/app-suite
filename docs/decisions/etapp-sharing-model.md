---
title: Etapp sharing model: admins sign in, travellers join by invite link
summary: Admins use OIDC and create trips; travel companions join with just a name via a link, no account
type: decision
status: accepted
updated: 2026-11-09
---

# Etapp sharing model

## Decision

Admins sign in with Pocket ID (OIDC) and create trips. Travel companions do not need an account: they join through an invite link (`/join/<code>`) with just a name, receive a long-lived cookie and a personal recovery link, and can then plan and tick things off. This is the same idea as in shopsplit.

Any traveller can edit the plan. The trip name, the invite link and the traveller list are admin-only.

## Why

A roadtrip is planned together by people who will never use the app otherwise; asking each of them to create an account would stop them joining. The admin is the only person who needs a real identity.

## Where the details are

How it works today (cookies, recovery links, live updates, offline ticking) is documented in [apps/etapp/README.md](../../apps/etapp/README.md). This page records the choice and the reason, the README stays the source for behaviour.
