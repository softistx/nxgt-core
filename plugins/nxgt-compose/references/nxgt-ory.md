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
- `docker-compose.dev.yaml` publishes exactly `4433`, `4466`, `4444`,
  `${APP_PORT}` and `5177`, and carries a comment explaining why the three admin
  ports are absent.

## Consequences already handled here — copy these too

- `kratos/app/env.server.ts` defaults are **container names**
  (`http://kratos:4433`), not `http://localhost:44xx`. Nothing publishes those
  ports, so a process on the host cannot reach any of the five.
- `scripts/setup.ts` reads `docker inspect` health instead of probing
  `127.0.0.1:44xx`, and resolves `DB_HOST`/`STACK_PREFIX` from the parsed `.env`.
- The admin scripts (`grant-admin`, `create-client`, `seed-clients`) and the
  Keto spec suite run through `docker compose exec`. That is the only mode now,
  not a fallback.
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
