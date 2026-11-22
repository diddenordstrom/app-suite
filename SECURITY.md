# Security policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue or pull request.

Use GitHub's private reporting: the repository's **Security** tab → **Report a vulnerability**.

Include what you found, how to reproduce it and which app or package it affects. This is a hobby project run by one person, so expect an answer within about a week, not hours.

## Scope

- The code in this repository: the apps in `apps/` and the shared packages in `packages/`.
- Sign-in, session handling, secret storage (AES-256-GCM) and anything that exposes one user's data to another are the most interesting areas.

Out of scope: the author's own server, DNS and hosted instances. Please do not scan or load-test them.

## Supported versions

Only the latest commit on `main` is supported. Fixes are not backported.

## Secrets

Never put real secrets in an issue, pull request or commit. If you find one committed here by mistake, report it as above.
