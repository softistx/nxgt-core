# `compose-a-stack` in nxgt-federation

A GraphQL federation: a supergraph gateway and several subgraphs, plus four UIs
(`sellix-ui`, `content-hub-ui`, `healthix-ui`, and the notes app). Eight compose
files. It consumes nxgt-ory over the network by URL.

**Not converted, and further from the shape than sellix.** The measurements:

- **It is on the wrong network.** Every file joins `nxgt_network`, not `proxy`.
  That is why its services publish ports instead of getting routes — there is no
  traefik on that network. **`proxy` is the network that is maintained**
  (decided 2026-09-20): it is the one nxgt-docker creates, the one traefik
  watches, and the one every other repository joins. `nxgt_network` is not a
  second option, it is a leftover. Moving to `proxy` is the first step here, and
  it is what makes every other rule applicable.
- **The base composes publish**: `5000` (supergraph, twice — the root file and
  `apps/supergraph/`), `3000`, `3001`, `3002` for the three UIs. Those become
  traefik routers plus a `docker-compose.dev.yaml` holding the same ports.
- **`docker-compose.dev.yaml` already exists** beside three UIs — but not as an
  override. Each declares its own `name:` (`content-hub-dev`), so it is a
  *second project*, not a layer over the first, and `COMPOSE_FILE` is not used.
  Drop the `name:` and the duplicated `networks:` block; a real override adds
  fields to the services the base file declares and nothing else.
- **The base compose mounts sources.** `volumes: - .:/app` sits in
  `docker-compose.yaml`, not in the dev file — so the production service runs
  the host's working tree. The mount belongs to the `dev` profile or to the
  override; the base service runs the image it built.
- **`~/.bun:/root/.bun` points outside the project** in both files, and the two
  disagree about the target (`/root/.bun` vs `/root/.bun/install`). Either make
  it a named volume or declare it an explicit shared-cache exception, like
  jenkins' in nxgt-docker.
- **No `ipv4_address` anywhere.** This repo is already clean on that point.
- **`GIT_PAT` is a build arg** in the base file. It reaches the image layer;
  check what the Dockerfile does with it before assuming the token is not in the
  published image.

## What is waiting on this repo

`nxgt-docker` keeps seven `docker-compose.dev.yaml` files alive — one TCP port each
— **only** because this repo and `sellix-monorepo` run dev servers on the host that
dial postgres, mongo, redis, mailpit's SMTP, minio's S3 API and rabbitmq's AMQP.
Moving these apps onto `proxy` in compose is what lets those seven files be
deleted, so the network move is not just tidiness here.

## The host scripts, same as sellix

`notes-ui/playwright/config/ory.ts`, `notes-ui/playwright.config.ts`,
`playwright/e2e/access.spec.ts` and `notes-ui/scripts/register-client.ts` all
call Kratos admin, Keto write or Hydra admin on `localhost`. They move to
`docker compose exec` or into a container on `proxy`.

## Two apps are leaving

`self-learning` and `content-hub` are being extracted into their own
repositories and made Ory-native. Do not invest in their compose files here
beyond the network move; write the new shape in the new repositories, from the
skill, and take nxgt-ory's compose as the model.
