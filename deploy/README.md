# Homelab deploy

Two Compose stacks run on marvin:

- **The apps** ([compose.yml](compose.yml)). [Komodo](https://komo.do) deploys them from `main`, so adding or changing an app is a pull request.
- **The infrastructure** ([komodo/compose.yaml](komodo/compose.yaml)): Traefik and Komodo. It is started by hand and rarely changes.

How it fits together:

- **Hostnames.** Cloudflare Tunnel sends `*.didrik.dev` and `didrik.dev` to Traefik, and Traefik routes by the `Host(...)` label on each service. A new app needs no Cloudflare change.
- **Deploys.** After a green push to `main`, CI pushes the changed images and then calls Komodo's deploy webhook (the `deploy` job in `.github/workflows/ci.yml`). Komodo pulls the repo, writes `deploy/.env` and runs `docker compose pull && up -d`. Komodo's daily Global Auto Update is the fallback.
- **Komodo's own config.** [komodo/app-suite.toml](komodo/app-suite.toml) is a resource sync: the stack's settings live in git and apply on push. The sync never deploys the app stack itself, because it runs before CI has built the images; the CI webhook does.
- **Secrets.** Secrets are Komodo variables marked secret, referenced in that file as `[[NAME]]`. They are stored in Komodo's database, never in git.
- **The UI.** Komodo is also the Docker UI for marvin: containers, logs, terminals and every stack.

## One-time setup

Do these once, in this order. The current stack keeps running until step 8 takes it over.

1. **Network.** Make sure the shared network exists: `docker network create proxy` (skip if it already does). cloudflared must be on it.
2. **Traefik and Komodo.**
   - `sudo mkdir -p /etc/komodo/setup`.
   - Copy [komodo/compose.yaml](komodo/compose.yaml) there, and copy [komodo/compose.env.example](komodo/compose.env.example) there as `compose.env`.
   - Fill in the empty values. Generate each with `openssl rand -hex 32`.
   - Start it: `cd /etc/komodo/setup && docker compose -p komodo --env-file compose.env up -d`.
   - Check that `docker compose -p komodo ps` shows five running services (Traefik, Postgres, FerretDB, Core, Periphery). FerretDB is used instead of MongoDB because recent MongoDB does not run on every ARM board.
3. **Cloudflare Tunnel** (Zero Trust → Networks → Tunnels → your tunnel → Public hostnames):
   - Add `*.didrik.dev` → `http://traefik:80` as the **last** rule. Rules match top to bottom, so the existing per-app hostnames, `sso` and `blog` keep working, and `komodo.didrik.dev` now reaches Komodo.
   - Check that DNS has a `*` CNAME to the tunnel, and add it if the dashboard did not create it.
4. **Log in** at `https://komodo.didrik.dev` with the admin from `compose.env`, then move the login to Pocket ID (the UI is on the internet):
   1. In Pocket ID, create an OIDC client `Komodo` with callback `https://komodo.didrik.dev/auth/oidc/callback`, allowed for a group with only you.
   2. In `compose.env`, set `KOMODO_OIDC_ENABLED=true`, the provider (the apps' `OIDC_ISSUER`), the client id and secret, and `KOMODO_DISABLE_OIDC_USER_REGISTRATION=false`. Then run `up -d`.
   3. Log in with OIDC. The new user starts disabled: as the local admin, enable it and make it admin under Settings → Users.
   4. Set `KOMODO_LOCAL_AUTH=false` and `KOMODO_DISABLE_OIDC_USER_REGISTRATION=true`, then run `up -d`. The admin password stays in your password manager as the way back in if Pocket ID is down.
5. **Providers** (Settings → Providers):
   - **Git:** `github.com`, account `diddenordstrom`, with a fine-grained token that has read-only *Contents* on this repo.
   - **Registry:** `ghcr.io`, account `diddenordstrom`, with a classic token that has `read:packages`. This replaces the `docker login` watchtower used.
6. **Variables** (Settings → Variables). Create every `[[NAME]]` used in [komodo/app-suite.toml](komodo/app-suite.toml). [komodo/import-env.sh](komodo/import-env.sh) does it from the old `.env` in one go (create an API key under Settings → Profile first, and delete it afterwards). By hand instead:
   - Copy the values from the old `.env` on marvin.
   - Mark everything secret except `APP_SUITE_DATA_DIR`.
   - Set `APP_SUITE_DATA_DIR` to the absolute path of today's data folder, e.g. `/home/didrik/stacks/app-suite/data`. The apps keep their databases where they are.
7. **Resource sync.** Create a Sync named `app-suite`:
   - Repo `diddenordstrom/app-suite`, branch `main`, account `diddenordstrom`, resource path `deploy/komodo/app-suite.toml`.
   - Run it. It creates the `app-suite` stack, and from then on the sync also manages itself.
8. **Take over the running stack.**
   - Stop watchtower: `docker rm -f watchtower`.
   - Deploy the `app-suite` stack in Komodo. It uses the same compose project name, so it replaces the containers in place.
   - Check each app at its hostname, then retire the old `~/stacks/app-suite/compose.yml` and `.env`. Keep `data/` and `backups/`.
   - In Cloudflare, point `didrik.dev` to `http://traefik:80` and delete the per-app hostnames (`runplan`, `shopsplit`, `etapp`, `garden`). From now on the wildcard covers every app, Brygga included.
9. **Webhooks.**
   - **GitHub repo** (Settings → Webhooks → Add):
     - Payload URL `https://komodo.didrik.dev/listener/github/sync/app-suite/sync`, content type `application/json`.
     - Secret: `KOMODO_WEBHOOK_SECRET`.
     - Events: just the push event.
     - This applies `app-suite.toml` changes on every push to `main`.
   - **GitHub Actions secrets** (Settings → Secrets → Actions):
     - `KOMODO_DEPLOY_URL` = `https://komodo.didrik.dev/listener/github/stack/app-suite/deploy`.
     - `KOMODO_WEBHOOK_SECRET` = the same secret as above.
     - The `deploy` CI job skips itself until these are set.
10. **Backups.** Point cron at the copy Komodo keeps checked out (see the header of [backup.sh](backup.sh)), with `DATA_DIR` set to the same path as `APP_SUITE_DATA_DIR`. Komodo backs up its own database to `/etc/komodo/backups` every night.

## Adding an app

1. Add a service to [compose.yml](compose.yml) with `traefik.enable`, a router `rule: Host(\`<app>.${DOMAIN}\`)` and port 3000.
2. If it needs settings or secrets, add `NAME=[[NAME]]` lines to `environment` in [komodo/app-suite.toml](komodo/app-suite.toml), and create the secret values in Komodo before merging.
3. If it signs in with Pocket ID, create its OIDC client with callback `https://<app>.didrik.dev/api/auth/callback`.
4. Merge. The sync updates the stack, CI builds the image and triggers the deploy.

## Day to day

- **Status and logs:** in Komodo, open the `app-suite` stack (per-service logs, terminal, stats).
- **Deploy now:** *Deploy* on the stack in Komodo.
- **Release without GitHub Actions:** *Run* on the procedure `release`. Komodo builds every app on marvin, one at a time, pushes the images to ghcr.io and deploys the stack. Nothing is tested first, so run `npm run check` before pushing to `main`. Needs the ghcr.io registry account in Komodo to have a token with `write:packages`.
- **Roll back one app:**
  1. In a PR, set its image to an older `:sha-<commit>` tag in `compose.yml` and merge it.
  2. A `:sha-…` tag never changes, so auto update leaves it alone.
  3. Switch back to `:latest` once a fix has shipped.
- **Restore a database:**
  1. Stop the service in Komodo.
  2. Copy `backups/<date>/<app>.db` to `<data>/<app>/app.db`, and delete any `app.db-wal`/`-shm`.
  3. Start the service.
- **Update Traefik and Komodo:** `cd /etc/komodo/setup && docker compose -p komodo --env-file compose.env pull && docker compose -p komodo --env-file compose.env up -d`. Upgrade FerretDB and its Postgres image together, following FerretDB's notes.
