---
paths:
  - "Dockerfile"
  - ".github/workflows/**"
  - "deploy/**"
  - "apps/portfolio/src/shared/apps.ts"
---

# Adding an app

When a new app is added, also update:

- the `COPY apps/...` lines in `Dockerfile` and the CI matrix in `.github/workflows/ci.yml`
- `deploy/`: a service in `compose.yml` with Traefik labels for its hostname, settings or secrets in `komodo/app-suite.toml` (secret values go in Komodo, never in git), and the app list in `backup.sh` if it has data
- the portfolio list in `apps/portfolio/src/shared/apps.ts`, with copy in both languages

Wiring sign-in and demo mode is a checklist under "Add an app" in [CONTRIBUTING.md](../../CONTRIBUTING.md).
