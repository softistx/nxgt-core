# `compose-a-stack` in sellix-monorepo

Seven backends and their UIs, in three compose files: `docker-compose.yml`
(the gateway), `apps/oauth/docker-compose.yaml` (api, ui, admin) and
`apps/bookmarks/docker-compose.yaml` (api, ui). It consumes nxgt-ory over
`proxy` by URL, and nothing else.

**Not converted yet.** What follows is measured, and is the work.

## What is already right

- **No app publishes a port.** The five services in `apps/` are reached through
  traefik only. The exception is the root `gateway`, which publishes `8080` and
  `4173` — decide whether that is a route or a genuine host-port need before
  removing it.
- Every inter-service URL is a container name (`mongo1:27017`,
  `redis:6379`, `minio:9000`, `kratos:4433`). The `${STACK_PREFIX:+…}` form
  keeps all of them working with no prefix set, so **none of these lines need
  changing**.

## What is wrong, in order of real cost

1. **The host scripts and Playwright configs** — the only real logic, and other
   repositories are now waiting on them: `nxgt-docker` still publishes seven TCP
   ports (postgres, mariadb, mongo, redis, mailpit SMTP, minio S3, rabbitmq AMQP)
   **only** because this repo and `nxgt-federation` run dev servers on the host
   that dial them. Those seven files are deleted when these move into compose.
   The immediate breakage is smaller: they call listeners that are no longer
   published at all:
   `apps/bookmarks/bookmarks-ui/playwright/config/ory.ts` (Kratos admin `4434`,
   Keto read `4466`), `playwright.config.ts` (all five, as literals in the
   `webServer` env), and
   `bookmarks-api/src/modules/bookmarks/bookmarks.routes.spec.ts` (`4433`,
   `4466`, `4467` in its documented run command). They move to
   `docker compose exec`, or to a container on `proxy` — the same move
   `kratos/` made in nxgt-ory, so copy that shape rather than inventing one.
   `kratos/playwright/config/network.ts` there is the transport to copy verbatim:
   one `docker compose exec -T … bun -e` per admin request.
2. **Five `ipv4_address`** — `apps/oauth` ×3 (`.130`, `.131`, `.132`),
   `apps/bookmarks` ×2 (`.144`, `.145`) — and the `PROXY_NET_PREFIX` line in
   `docker/shared.env`. All five default to `172.20.0`, which is **not** the
   live subnet; they work only because a declared subnet is ignored for an
   existing network. Nothing outside docker's DNS names any of them, so all five
   go, and the `shared.env` line with them.
3. **The shared hostname.** `bookmarks-ui` claims
   `Host(kratosix.${HOST}) && PathPrefix(/bookmarks)` at `priority: 10`, against
   kratos-ui's `priority: 1` on the same host — because `ory_kratos_session` is
   host-only. nxgt-ory now takes that name from `UI_HOSTNAME`, so this repo must
   read the same variable, with the same value. It is one label, but it is the
   label authentication depends on.
4. **The zod defaults** — `bookmarks-api/src/env.ts` and
   `bookmarks-ui/app/env.server.ts` default to `http://localhost:44xx`. The real
   values come from the compose, so nothing breaks; they are simply false now,
   and become container names.
5. **The prose** — the `AGENTS.md`/`README.md` passages that describe reaching
   the stack on a published port.

## When you add a service here

`HOST` composition (`oauth-api.${HOST:-softistx.com}`) is the old shape. New
services declare a whole `*_HOSTNAME` variable, and the conversion moves the
existing five to the same form — the names themselves do not change, so
production and the wildcard certificate are unaffected.
