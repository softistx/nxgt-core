# `compose-a-stack` in nxgt-federation

A GraphQL federation: a supergraph gateway and several subgraphs, plus four UIs
(`sellix-ui`, `content-hub-ui`, `healthix-ui`, and the notes app). Eight compose
files. It consumes nxgt-ory over the network by URL.

**Converted on 2026-09-21** (PR #210). Everything below the next heading is the
state it was converted *from*, kept because it is the shape of every repository
that has not been converted yet. What it looks like now:

- one `proxy`, no `nxgt_network`, no published port in either profile
- `prod` and `dev` profiles on the root compose and on all three UI stacks; the
  three `docker-compose.dev.yaml` second-projects and the three
  `Dockerfile.development` are gone
- `oxmgr` runs five processes in one container, which is why notes-ui's Vite keeps
  an explicit `port: 5401` while every other dev server dropped its own — five
  servers in one network namespace do need distinct numbers (skill §8 is about
  names that are global to the *machine*; this one is not)
- `traefik.enable=true` literal, and every `proxy` address in `docker/shared.env`
  written out (skill §9)
- every `health_cmd` on `bun -e` and on `/health`, never `curl` and never
  `{__typename}` (skill §10)

**One finding here is worth carrying to any repo with a browser-facing OAuth2
client.** notes-ui needs *two* Hydra URLs, and one string cannot do both jobs:
measured on glibc 2.41, inside a container any `*.localhost` name resolves to
`::1` and `/etc/hosts` is not consulted, so `extra_hosts` and `--add-host` cannot
redirect it. A local public hostname is reachable from the browser and from
nothing else. So the issuer stays the public hostname — it is what the browser is
sent to and what the id token is signed by — and a second variable carries the
container name for the calls the server makes, with one `fetch` wrapper rewriting
that one origin. Give the second variable an empty default: empty means "use the
public one", which is right wherever the public name resolves from inside.

## What it was converted from

The measurements, as of 2026-09-20:

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
— **only** because this repo and `sellix-monorepo` ran dev servers on the host that
dial postgres, mongo, redis, mailpit's SMTP, minio's S3 API and rabbitmq's AMQP.

Both repos now run in compose, so those seven files can go. One thing still holds
them: `bun run dev` on the host still works for the **subgraphs** here, and only
because those ports are published. Deleting them is the right next step and it
closes that door deliberately rather than by accident.

## The host scripts, same as sellix — done

`notes-ui/playwright/config/ory.ts`, `notes-ui/playwright.config.ts`,
`playwright/e2e/access.spec.ts` and `notes-ui/scripts/register-client.ts` all
called Kratos admin, Keto write or Hydra admin on `localhost`. They now go
through `playwright/config/network.ts`, a `docker compose exec -T` transport
ported from nxgt-ory's — keep the copies in step. `register-client` runs in the
container too, and with `--user "$(id -u):$(id -g)"`, because it writes
`.env.local` into the mounted tree: as root that leaves a root-owned file on the
host and the next host-side typecheck fails on `EACCES` somewhere unrelated.

## Two apps are leaving

`self-learning` and `content-hub` are being extracted into their own
repositories and made Ory-native. Do not invest in their compose files here
beyond the network move; write the new shape in the new repositories, from the
skill, and take nxgt-ory's compose as the model.
