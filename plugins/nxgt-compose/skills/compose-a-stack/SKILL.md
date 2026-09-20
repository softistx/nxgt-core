---
name: compose-a-stack
description: >-
  Write the docker compose of an nxgt stack so two deployments of it can run
  on one machine: no published port, a `STACK_PREFIX` for the docker names
  and a whole hostname per service for DNS, no pinned address, no route in
  front of an unauthenticated listener, a `dev` profile with mounted sources
  beside the `prod` one, and every host volume inside the project. Use when
  writing or editing a `docker-compose*.yaml`, adding a service to a stack,
  publishing or unpublishing a port, wiring a dev mode, or deciding where a
  volume, a hostname or a database lives.
---

# Skill: Compose a stack

## Purpose

Every service in these repositories runs on **one** external docker network,
`proxy`, reached through one traefik. There is exactly one — `nxgt_network`, in
the repositories that still declare it, is a leftover to be migrated, not an
alternative. `proxy` is created by nxgt-docker's traefik and is `external: true`
everywhere else. That makes three things shared, and
therefore three things that collide: **host ports**, **container names**, and
**IP addresses**. A stack that takes any of them for itself can be deployed
once per machine — and that is the constraint this skill removes.

**Read `references/<repo>.md` for the repository you are in** — it says how far
that repository has been converted and what is measured about it.

| repository | reference |
| --- | --- |
| `nxgt-ory` | `references/nxgt-ory.md` — **the worked example**, converted first |
| `nxgt-docker` | `references/nxgt-docker.md` — the platform layer, owns `proxy` and traefik |
| `sellix-monorepo` | `references/sellix-monorepo.md` |
| `nxgt-federation` | `references/nxgt-federation.md` |

A repository with no reference here still follows the nine rules; add its
reference when you convert it, in the shape of the others — what it is, what is
already right, what is wrong in order of real cost, and what to do when adding a
service to it.

---

## 1. Nothing publishes a port

No `ports:` in the base compose. Not for the app, not for the API, not for the
database. A service is reached:

- from another container, **by its container name** on `proxy`;
- from a browser or the host, **through traefik**, by hostname.

Publishing a port is how a stack claims a number that no second deployment can
have, and — for anything that is not itself an authenticated API — it is also
how an internal listener becomes reachable from the whole machine.

`.localhost` hostnames need no `/etc/hosts` entry. Measured: glibc resolves any
name under the reserved `.localhost` TLD (RFC 6761) to `127.0.0.1` **and**
`::1`, at any depth, with `systemd-resolved` inactive. Docker publishes traefik
on `0.0.0.0` and `[::]`, so the v6 answer that comes back first works.

## 2. Two namespaces, and they are not the same one

| namespace | variable | what it covers |
| --- | --- | --- |
| docker | `STACK_PREFIX` | the project name, every `container_name`, every traefik router/service/middleware name |
| DNS | one `*_HOSTNAME` per service | the `Host()` rules, and the URLs built from them |

```yaml
name: ${STACK_PREFIX:-my-stack}
services:
  api:
    container_name: ${STACK_PREFIX:+${STACK_PREFIX}-}api
    labels:
      - traefik.http.routers.${STACK_PREFIX:+${STACK_PREFIX}-}api.rule=Host(`${API_HOSTNAME:-api.localhost}`)
```

**The `:+` form, never `:-`.** `${STACK_PREFIX:+${STACK_PREFIX}-}` expands to
nothing when the variable is empty and to `ory2-` when it is set. That is what
makes the change backward compatible: with no prefix the containers keep the
names they had, so every `http://kratos:4433` in a consumer repo and every
`export` in a shell profile keeps working, and a second deployment only has to
set one variable to collide with nothing.

**Hostnames are declared whole, one per service — never composed** from a base
domain and a prefix. Two reasons. A wildcard certificate covers exactly one
label, so `kratos-ory2.softistx.com` is servable and `kratos.ory2.softistx.com`
is not; and a composition rule is a rule the next reader has to reconstruct,
where a `.env` line can just be read:

```
KRATOS_HOSTNAME=kratos.localhost      # prod: kratos.softistx.com
UI_HOSTNAME=kratosix.localhost        # prod: kratosix.softistx.com
```

A `Host()` rule takes a bare name, but an issuer, a `base_url` and a
`return_to` are whole URLs — so add one `PUBLIC_SCHEME` (`https` by default,
`http` on a dev machine) and build them:
`${PUBLIC_SCHEME:-https}://${UI_HOSTNAME}`.

When two UIs must share `ory_kratos_session`, they share the hostname and
separate on `&& PathPrefix(...)`, with an explicit `priority` on each router.
That cookie is host-only; this is not a shortcut, it is the only shape that
works.

## 3. An unauthenticated listener gets no port and no route

Kratos admin `4434`, Keto write `4467`, Hydra admin `4445`: whoever reaches
them can read every identity, grant themselves any permission, or accept a
login as anybody, with no credential involved. They are in the compose because
the server-side code calls them by container name. They get:

- no `ports:` entry, **in any file, including the dev override**;
- no `traefik.http.routers.*` label;
- no `VITE_`-prefixed variable, ever.

This used to "rest on a convention: nobody adds a label". Once nothing is
published it is structural, and that is the point of the whole exercise — do
not hand it back for the convenience of one script. A host script that needs an
admin API runs `docker compose exec`, and a test suite that writes tuples runs
inside the network.

## 4. No pinned address

No `ipv4_address`, and no subnet in the compose that joins `proxy` — the
network is `external: true` there, and only the file that creates it declares
its `ipam`.

The one criterion for an exception: **something outside docker's DNS has to
name the address.** Today that is two services in `nxgt-docker` — traefik
(`.2`) and the mail server (`.5`) — because traefik's PROXY protocol
`TRUSTEDIPS` is a list of addresses, not of names. Widening it to the `/24`
would trust every container on the network to forge its source IP. An exception
carries the comment saying which reader outside docker needs it.

Measured, and worth knowing before you debug one: a `subnet:` declared for a
network that **already exists** is ignored, with a warning only — so a wrong
prefix in a default can sit there for months looking correct. An
`ipv4_address` outside the real subnet is refused outright
(`no configured subnet contains IP address …`).

## 5. The compose declares its databases; dev reuses the one that is running

Every stack declares its own database as an ordinary service — no profile, no
`ports:`, `traefik.enable=false`, its data under `./data/`. A repository whose
compose does not say which database it needs is a repository you cannot deploy
twice, or anywhere else.

On a dev machine most stacks share one postgres container. That is the
**override's** job, not the base file's:

```yaml
# docker-compose.dev.yaml — reuse the machine's postgres, do not start ours
services:
  my-postgres:
    profiles: ["own-db"]
```

and the `.env` on that machine points `DB_HOST` at the shared container. The
service is still declared, still documented, still startable with
`--profile own-db`; it is simply not started by default here.

Measured, and the reason this works: an override file that **adds** `profiles:`
to a service excludes it from a default `up`.

## 6. Every host volume lives inside the project

```yaml
volumes:
  - ./data/postgres:/var/lib/postgresql/data      # yes
  - ~/data/postgres:/var/lib/postgresql/data      # no
  - ${DATA_DIR}/postgres:/var/lib/postgresql/data # no
```

A bind that points outside the compose file's own directory means the state of
a service is invisible from the service, and two deployments end up sharing a
directory that neither of them names. `./data/` is in `.gitignore`, one per
project directory.

The exceptions are the paths that are not the project's state at all — the
docker socket, `/etc/localtime`, `/etc/ssl`, a host runtime socket. Those are
the machine, and they stay absolute. A build cache shared on purpose
(`~/.bun`, `~/.m2`) is an exception too, and it is written down as one.

## 7. `dev` and `prod` are profiles, and mounted sources belong to `dev`

```yaml
services:
  ui:                     # the built image
    profiles: ["prod"]
  ui-dev:                 # the same Dockerfile, target: dev, sources mounted
    profiles: ["dev"]
```

Two services claiming the same `Host()` rule **must** carry opposing profiles,
or traefik gets two routers for one name. The stateful services
(database, the identity stack) carry no profile at all, so they start either
way.

The dev service mounts the sources, plus an anonymous volume over every
`node_modules` the image installed — otherwise the host's tree masks the
container's install. If the repo builds libraries the bundler does not compile,
give each one a watcher service on the `dev` profile running its
`build --watch`, and say in a comment why the watcher exists: without it,
editing `packages/*/src` changes nothing visible and the reason is invisible.

Two measured traps:

- **Memory.** Vite and `tsc` are killed silently under a low `mem_limit` —
  exit `137` or a negative code, and `tsc` writes *nothing at all*, so a build
  script must report the exit code or the failure reads as a type error. 4g for
  a dev app container, 2g for a watcher.
- **Vite behind a proxy** answers `403 Blocked request` for a `Host` it does
  not know: set `server.allowedHosts`, and `server.hmr.clientPort` to the port
  the browser actually talks to (80 behind traefik).

## 8. Ports on a dev machine come from an override file, not a profile

A profile cannot do this. Measured: `profiles:` is a **service** key, not a
field key, so there is no way to make `ports:` conditional
(`services.x.ports must be a array`), and an empty entry is refused
(`no port specified: <empty>`). The mechanism is a second file:

```
# .env, on the machine that wants them — never committed
COMPOSE_FILE=docker-compose.yaml:docker-compose.dev.yaml
```

`docker-compose.dev.yaml` holds `ports:` blocks and nothing else. With it, an
ordinary `docker compose up` publishes; in production, where the `.env` has no
`COMPOSE_FILE`, the same command publishes nothing.

It holds **only the ports a human needs from the host** — the public listeners
and the UI. Not the admin ones (§3), and a database port only as a convenience
for a GUI, since the application itself runs in compose too and joins by
container name.

## 9. `.env` is the machine, `.env.example` is the contract

The `.env` is untracked and keeps real values; `.env.example` is tracked and
carries the same keys with placeholders — or, where the repo's convention is
working dev values, values that actually work. When a new variable replaces a
hardcoded value, **pre-fill it with today's effective value**, so that
`docker compose up` behaves identically after the change.

Two things that bite:

- compose interpolates the `.env` too, so a literal `$` in a value must be
  `$$` — a basicauth hash moved from a label into `.env` *loses* its doubling.
- the **shell** environment wins over the `.env`. A stale `export` in a
  profile silently overrides the file, and the container you just created gets
  the old value.

Secrets already committed stay in the history: moving the file out of git does
not rotate them. Note what needs rotating in `AGENTS.md`; do not pretend the
move fixed it.

---

## Checking it

```bash
docker compose config                 # interpolation, before anything runs
docker compose --profile prod build   # with NO profile, this builds nothing:
                                      # "No services to build"
docker compose up -d
docker ps --format '{{.Names}}\t{{.Ports}}'        # no published port
curl -I http://<service>.localhost/health/ready    # 200 through traefik
curl -I http://localhost:<admin-port>/             # connection refused
```

Then the test that proves the exercise — the same stack twice, side by side:

```bash
STACK_PREFIX=ory2 KRATOS_HOSTNAME=kratos-ory2.localhost \
  UI_HOSTNAME=kratosix-ory2.localhost docker compose up -d
```

Both answer on their own hostnames, and nothing collides. A second deployment
needs its own database roles, so check what the repo's setup script reads
before running it twice against one server.
