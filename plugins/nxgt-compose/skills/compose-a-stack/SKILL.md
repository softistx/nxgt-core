---
name: compose-a-stack
description: >-
  Write the docker compose of an nxgt stack so two deployments of it can run
  on one machine, in development as in production: no published port at all,
  a `STACK_PREFIX` for the docker names and a whole hostname per service for
  DNS, no pinned address, no route in front of an unauthenticated listener, a
  `dev` profile with mounted sources beside the `prod` one, and every host
  volume inside the project. Use when writing or editing a
  `docker-compose*.yaml`, adding a service to a stack, publishing or
  unpublishing a port, wiring a dev mode, or deciding where a volume, a
  hostname, an image tag or a database lives.
---

# Skill: Compose a stack

## Purpose

Every service in these repositories runs on **one** external docker network,
`proxy`, reached through one traefik — which is the single exception to the rule
below, because it is the ingress and its ports are what it is. There is exactly one — `nxgt_network`, in
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

A repository with no reference here still follows the eleven rules; add its
reference when you convert it, in the shape of the others — what it is, what is
already right, what is wrong in order of real cost, and what to do when adding a
service to it.

---

## 1. Nothing publishes a port — in development either

No `ports:` anywhere: not in the base compose, not in a `dev` profile, not in an
override file. Not for the app, not for the API, not for the database. A service
is reached:

- from another container, **by its container name** on `proxy`;
- from a browser or the host, **through traefik**, by hostname.

Publishing a port is how a stack claims a number that no second deployment can
have, and — for anything that is not itself an authenticated API — it is also how
an internal listener becomes reachable from the whole machine. Neither reason
weakens in development: development code runs in compose too, on `proxy`, so it
joins its siblings by container name and needs nothing published. A dev port
would buy nothing and would make two dev stacks collide.

`.localhost` hostnames need no `/etc/hosts` entry. Measured: glibc resolves any
name under the reserved `.localhost` TLD (RFC 6761) to `127.0.0.1` **and**
`::1`, at any depth, with `systemd-resolved` inactive. Docker publishes traefik
on `0.0.0.0` and `[::]`, so the v6 answer that comes back first works.

### The two cases that are not a service reaching out

**A port that IS the interface.** Traefik's `:80` and `:443`, a resolver's `:53`
and DHCP, a mail server's SMTP and IMAP listeners, an FRP server's `:7000`: for
these the port is what the thing is, and a resolver nothing can reach is not a
resolver. They stay published, in the **base** file with the comment saying why,
and they collide with nothing because there is exactly one of each per machine —
that is the ingress, not a service.

**A service that does not speak HTTP.** Postgres, MariaDB, Mongo and Redis get no
port either, and the reason is not traefik — it is that **everything is on
`proxy`**. Whatever needs the database is a container on that network, in
development exactly as in production, so it connects to `my-postgres:5432` by
name. There is nothing left for a host port to serve.

That is also why traefik is not the answer here and does not have to be: an HTTP
router does not apply to the postgres wire protocol, and a TCP router would need an
entrypoint of its own per port — a host port again, under another name.

The two things a human still does, neither of which claims a number:

```bash
docker compose exec my-postgres psql -U app app        # a shell
docker compose exec my-postgres pg_dump -U app app > ./data/dump.sql
```

and, for a GUI, a container of its own on `proxy` behind traefik (pgAdmin, dbgate,
mongo-express) rather than a desktop client on the host. That desktop client is the
one workflow this costs.

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

**Its image tag carries the prefix too.** `image: nxgt/my-ui:dev` is a global
name: a second deployment that rebuilds it replaces the first one's image
underneath it. Write `image: ${STACK_PREFIX:+${STACK_PREFIX}-}my-ui:dev`, the same
form as everything else.

**The dev server keeps its framework's default port.** There is nothing to choose:
each container has its own network namespace, so Vite's 5173 cannot collide with
anything, and a pinned port is one more number two deployments could have
disagreed about. The traefik `loadbalancer.server.port` label points at that
default. What does have to be set is not the port:

```ts
server: {
	host: '0.0.0.0',          // not just the container's loopback
	allowedHosts: ['.localhost', APP_HOST],  // Vite 8 answers 403 otherwise
	hmr: { clientPort: 80 },  // the browser talks to traefik, not to the container
},
```

Two measured traps:

- **Memory.** Vite and `tsc` are killed silently under a low `mem_limit` —
  exit `137` or a negative code, and `tsc` writes *nothing at all*, so a build
  script must report the exit code or the failure reads as a type error. 4g for
  a dev app container, 2g for a watcher.
- **Vite behind a proxy** answers `403 Blocked request` for a `Host` it does
  not know: set `server.allowedHosts`, and `server.hmr.clientPort` to the port
  the browser actually talks to (80 behind traefik).

## 8. The dev layer carries no global name

A development stack has to be as deployable-twice as the production one — the
machine where two deployments actually meet *is* the dev machine. So the dev
layer, whether it is a profile or an override file, may contain **nothing that
names something outside its own project**:

| not in the dev layer | because |
| --- | --- |
| `ports:` | a host port is one number for the whole machine (§1) |
| a fixed `image:` tag | a rebuild replaces the other deployment's image (§7) |
| a fixed data path | two stacks would write the same directory (§6) |
| a network alias, a fixed subnet, an address | `proxy` is shared (§4) |
| a database name or role | `setup` would migrate the same database twice (§5) |

What an override file **is** for is substituting a service, not exposing one:

```yaml
# docker-compose.dev.yaml — reuse the machine's postgres, do not start ours
services:
  my-postgres:
    profiles: ["own-db"]
```

```
# .env, on that machine — never committed
COMPOSE_FILE=docker-compose.yaml:docker-compose.dev.yaml
DB_HOST=postgres
```

A profile could not express even that much. Measured: `profiles:` is a **service**
key, not a field key, so no profile can make a field conditional
(`services.x.ports must be a array`), an empty port entry is refused
(`no port specified: <empty>`), and `ports:` does not interpolate as a list. An
override file that **adds** `profiles:` to a service is what takes it out of a
default `up` — which is the whole mechanism behind §5.

`ports:` is not the only field a shell reaches, either — §9 is about everything else it
reaches.

The simplest way to run two stacks at once is two clones, each with its own
`.env`, its own `STACK_PREFIX` and its own `./data/`. Everything above is what
makes that work without editing a single compose file.

## 9. The shell beats the file, so an address is not a variable

Compose gives the **shell environment precedence over `.env`**, and an `env_file`
whose lines are `${VAR:-default}` inherits from whatever ran compose. So a stale
export in a profile decides what a container gets, and nothing in the repository
is wrong.

Measured three times on one machine, on 2026-09-20 and 2026-09-21:

| the export | what it did |
| --- | --- |
| `REDIS_URL=redis://localhost:6379` | four processes in one container retrying `ECONNREFUSED 127.0.0.1:6379`; in a sibling repo a container died on `Reached the max retries per request limit` after twenty |
| `TRAEFIK_ENABLE=false` | two hostnames answering traefik's own plain-text 404, beside a third answering 200 because *that* container had been created in a shell without the export |
| `APP_PORT=3006`, from a stale `.env.example` | another repo's federated query answering `Unable to connect` while every container in both repos reported healthy |

Every one of them was correct when it was written. That is the pattern: a value
describing the old world survives in a shell profile and outlives the change.

**The rule.** A name with exactly one right answer on this network is not a
variable — write it out:

```bash
# docker/shared.env — every address inside `proxy`, literal
MONGO_HOSTS=mongo1:27017,mongo2:27017
REDIS_URL=redis://redis:6379
KETO_WRITE_URL=http://keto:4467

# still indirected: no single right answer, and compose must refuse to guess
MONGO_PASSWORD=${MONGO_PASSWORD:?export MONGO_PASSWORD}
JWT_SECRET=${JWT_SECRET:?export JWT_SECRET — must match the OAuth server's}
MAIL_HOST=${MAIL_HOST:-mailpit}
```

Secrets, credentials, policy (`CORS_ORIGINS`) and endpoints a machine may
legitimately point elsewhere (mail) keep indirecting. Addresses on the shared
network do not. **To override an address anyway, put it in that service's
`environment:`**, which beats `env_file:` — a deliberate, readable override
instead of whatever the shell happens to hold.

**`traefik.enable` is a literal `true`, never `${TRAEFIK_ENABLE:-true}`.** Once
nothing publishes a port (§1), traefik is the only ingress, so a route is not an
option a machine-wide setting may withdraw. A service that must *not* be routed
says `traefik.enable=false` outright, and an unauthenticated listener carries no
label at all (§3). `TRAEFIK_HTTP_ENTRYPOINTS` and `TRAEFIK_USE_TLS` stay
variables: *which* entrypoint, and whether it terminates TLS, really are
properties of the shared network. Whether a service has a route is a property of
that service — the three were never the same kind of thing, and grouping them is
what made this look consistent.

Labels are read **at container creation**, so neither a `restart` nor a traefik
reload changes one. A fix needs `up -d`, and that is why one container can
disagree with its neighbours indefinitely.

**A container-internal port is a cross-repo constant when another repo dials it.**
It looks private — nothing publishes it, each container has its own namespace — so
it drifts into a per-app `.env`. But a sibling repository naming
`http://oauth-api:3000/api` has no compiler to tell it the number moved. Pick one
number for every service in the parc, keep it in the compose file, and say in
`AGENTS.md` who dials it.

## 10. A health probe must be runnable, and must answer for one process

Two ways a probe is worse than none, both measured:

- **The binary is not in the image.** Five `health_cmd` lines used `curl`; the bun
  base image has neither `curl` nor `wget`. Every probe failed with
  `sh: 1: curl: not found` and the stack booted anyway, so nothing announced it.
  Use the interpreter the image is built on:
  `bun -e 'const r = await fetch("http://localhost:5401/health"); process.exit(r.ok ? 0 : 1)'`.
- **The probe federates.** `{__typename}` on a gateway is planned across its
  subgraphs, so it reaches another project's containers and fails whenever that
  project is down. A liveness probe answers for its own process: `/health`.

## 11. `.env` is the machine, `.env.example` is the contract

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
docker compose --profile dev up -d
docker ps --format '{{.Names}}\t{{.Ports}}'        # the Ports column is EMPTY,
                                                   # in dev as in prod
curl -I http://<service>.localhost/health/ready    # 200 through traefik
curl -I http://localhost:<admin-port>/             # connection refused
grep -rn 'ports:' docker-compose*.yaml             # only what IS the interface

# §9 — what the SHELL did to the container you just created
docker inspect <name> --format '{{index .Config.Labels "traefik.enable"}}'
docker exec <name> env | grep -E '_URL|_HOSTS'
env | grep -E '^(TRAEFIK_|REDIS_|KRATOS_|KETO_|HYDRA_|APP_PORT)'   # if set, it won
```

Then the test that proves the exercise — the same stack twice, side by side, and
run it with `--profile dev`, since that is the mode two of them will actually be
in:

```bash
STACK_PREFIX=ory2 KRATOS_HOSTNAME=kratos-ory2.localhost \
  UI_HOSTNAME=kratosix-ory2.localhost docker compose --profile dev up -d
```

Both answer on their own hostnames, and nothing collides. A second deployment
needs its own database roles and its own `./data/`, so check what the repo's setup
script reads before running it twice against one server — or give the second one
its own clone, which is the shape this is built for.
