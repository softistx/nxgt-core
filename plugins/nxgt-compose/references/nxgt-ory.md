# `compose-a-stack` in nxgt-ory

**This is the worked example.** nxgt-ory was converted first, on 2026-09-20, and
its `docker-compose.yaml` is the file to copy from for every rule in the skill.
It runs Kratos, Keto and Hydra plus `kratos/` (the self-service UI, the Hydra
challenge routes, and the operator console at `/admin`), and it is the stack
whose admin listeners make rule §3 non-negotiable.

Load the repo's own `change-stack-config` skill before touching `config/`: the
URLs those files hold are overridden by environment variables from this compose,
so editing a URL there alone changes nothing.

## What the file does

- `name: ${STACK_PREFIX:-nxgt-ory}`, and
  `container_name: ${STACK_PREFIX:+${STACK_PREFIX}-}kratos` on each of the four
  services. Empty prefix → `kratos`, `keto`, `hydra`, `kratos-ui`, which is why
  eleven container-name references in sellix-monorepo and nxgt-federation, and
  the four `KRATOS_*_URL`/`KETO_*_URL` exports in the shell profile, were not
  touched at all.
- Four hostname variables — `KRATOS_HOSTNAME`, `KETO_HOSTNAME`,
  `HYDRA_HOSTNAME`, `UI_HOSTNAME` — plus `PUBLIC_SCHEME`. `HOST` is no longer
  read by this file.
- **Three routers, for three public listeners**: Kratos `4433`, Keto read
  `4466`, Hydra public `4444`. Kratos admin `4434`, Keto write `4467` and Hydra
  admin `4445` have no router and no port anywhere.
- `ory-postgres` is an ordinary service with `./data/postgres`,
  `traefik.enable=false`, and the three DSNs composed from `DB_HOST` and the
  per-service `*_DB_*` variables. `docker-compose.dev.yaml` gives it
  `profiles: ["own-db"]`, and this machine's `.env` sets `DB_HOST=postgres` —
  the shared container from nxgt-docker.
- The `dev` profile: `kratos-ui-dev` (`build.target: dev`, sources mounted,
  `mem_limit: 4g`), and `ory-sdk-watch` / `ory-react-watch` from one YAML anchor
  (`mem_limit: 2g`), running `build.ts --watch`. `kratos-ui` carries
  `profiles: ["prod"]` because both claim `Host(UI_HOSTNAME)`.
- `docker-compose.dev.yaml` publishes **nothing**. It published those five for a
  day and they were removed the same week: development runs in compose too, so a
  human uses a hostname and a process uses a container name. What is left in the
  file is the one thing a dev machine differs by — `ory-postgres` with
  `profiles: ["own-db"]` — plus a comment saying why there is nothing else.
- **Vite keeps its default port** (5173). The pinned 5177 belonged to
  `bun run dev` on the host, when the port was published. `vite.config.ts` still
  sets `host: '0.0.0.0'`, `allowedHosts` and `hmr.clientPort: 80`; none of those is
  the port.
- **The `image:` tags carry the prefix**
  (`nxgt/kratos-ui:${STACK_PREFIX:+${STACK_PREFIX}-}dev`). A fixed tag is as global
  as a port: a second deployment that rebuilt it would replace the first one's
  image underneath it.

## Consequences already handled here — copy these too

- `kratos/app/env.server.ts` defaults are **container names**
  (`http://kratos:4433`), not `http://localhost:44xx`. Nothing publishes those
  ports, so a process on the host cannot reach any of the five.
- `scripts/setup.ts` reads `docker inspect` health instead of probing
  `127.0.0.1:44xx`, and resolves `DB_HOST`/`STACK_PREFIX` from the parsed `.env`.
- The admin scripts (`grant-admin`, `create-client`, `seed-clients`) and the
  Keto spec suite run through `docker compose exec`. That is the only mode now,
  not a fallback.
- **The e2e suite reaches the three admin listeners the same way, per request.**
  `kratos/playwright/config/network.ts` runs each one as
  `docker compose exec -T kratos-ui-dev bun -e '<fetch>' '<request as JSON>'` —
  the request crosses as one JSON argument, because quoting a URL and a body into
  `-e` is a shell-escaping bug waiting to happen. About 0.3s per call, so only
  those three go that way; Hydra's public API, Mailpit and the app are routed or
  published and are fetched directly. Copy this when a suite in another repo hits
  the same wall.
- **The dev containers run as uid 1000 (`bun`), not root.** They mount the host's
  sources and create files in them — typegen output, each package's `dist/` — and
  as root those arrive owned by root, after which `bun run typecheck` on the host
  dies with `EACCES`. It hid for a day because overwriting an existing file keeps
  its owner: only newly created files were affected. The install happens as that
  user so there is no `chown -R` layer, and the anonymous `node_modules` volumes
  take their ownership from the image.
- `kratos/playwright.config.ts` targets `${PUBLIC_SCHEME}://${UI_HOSTNAME}` and
  reuses the dev container (`reuseExistingServer`) rather than starting
  `bun dev` on the host.
- `kratos/Dockerfile` has four stages — `deps`, `builder`, `runtime`, `dev` —
  with `dev` built `FROM deps`. `FROM builder AS dev` makes the dev image run
  the production build.

## Still open

`charts/nxgt-ory` was deliberately left out of the conversion, so the chart and
the compose disagree on hostnames until that lot lands. Say so when you touch
either; `scripts/verify-chart.ts` does not check hostnames.
