---
name: lay-out-a-product-repository
description: >-
  Lay out a product as ONE repository holding every deployable of it —
  `apps/api`, `apps/ui` — plus the `packages/` they share by `workspace:^`
  and never publish, with one lockfile, one biome, one compose file and one
  Dockerfile at the root. Use when creating a repository for a product,
  deciding whether the UI and the API of one product belong together or
  apart, adding an app or a shared package to such a repository, naming its
  workspaces, or wiring its CI, Dockerfile or `.dockerignore`.
---

# Skill: Lay out a product repository

## Purpose

**The unit of a repository is a product, not a deployable.** One product — one
repository, holding every process that product ships plus every package those
processes share:

```
<product>/                        # softistx/self-learning, softistx/content-hub
	package.json                  # private, workspaces: apps/*, packages/*
	bun.lock                      # ONE lockfile for every workspace
	biome.json                    # one formatter, one config
	tsconfig.base.json            # one compiler baseline
	docker-compose.yaml           # prod + dev profiles, all of it
	docker/Dockerfile             # one context, one install, N targets
	.dockerignore                 # a secret boundary — see §7
	.github/workflows/ci.yml
	AGENTS.md  CLAUDE.md  README.md  .env.example
	apps/
		api/                      # @<product>/api
		ui/                       # @<product>/ui
	packages/
		README.md                 # what is reserved, and why it is not published
```

Two deployables in one repository is not a compromise between a monorepo and a
polyrepo. It is the answer to one question: **where does the code they share
live?** Everything below follows from that.

**Read `references/<product>.md` for the repository you are in.**

| product | reference |
| --- | --- |
| `self-learning` | `references/self-learning.md` — **the worked example**, and Ory-native |
| `content-hub` | `references/content-hub.md` — same layout, extracted with its auth debt intact |

A product with no reference here still follows the ten rules; add its reference
when you create it, in the shape of the others.

---

## 1. The shared package is the whole argument

A product's API owns a GraphQL schema and its UI generates client documents from
a copy of it. Two files that must agree, with nothing checking that they do. The
fix is one package holding the `.graphqls` files and the codegen configuration,
consumed by both apps.

That package can live in one of two places, and the difference is not stylistic:

| | `workspace:^` in this repo | a published `@nxgt/<product>-schema` |
| --- | --- | --- |
| resolution | `bun.lock`, this checkout | npmjs, whatever was last released |
| to change the schema | one commit, one PR | publish, bump, install, in that order |
| to get it wrong | you cannot | three separate ways |

Those three ways have all happened in this organisation:

- **A version that was never installed.** `changeset version` rewrites manifests
  and leaves `bun.lock` alone, and `bun pm pack` substitutes a sibling's
  `workspace:^` **from the lockfile** — so publishing straight after versioning
  ships yesterday's internal ranges. `@nxgt/shared-graphql@2.0.0` went out asking
  for `@nxgt/security@^3.2.1` while its `dist` imported the 4.0.0 API.
- **Two copies of one class.** That well-formed caret installed **both majors**,
  and `OryUnavailable` is caught with `instanceof`. Two copies are two classes: a
  Kratos outage answered 500 instead of 503, with a green build and green types.
- **A release order across repositories.** Two consumers sat blocked behind a
  major of a third repository for days, because the package had to land on npmjs
  before either could move.

`workspace:^` has none of them. There is no registry, no version to bump and no
order to get wrong — and that is why the two apps of one product live in one
repository rather than two.

**The corollary, which is the rule:** two deployables that share code are one
repository. Two products that share code share a **published** package, and pay
the price above on purpose, because the alternative is a monorepo that owns
everything.

## 2. `packages/` is reserved before it is populated

Create `packages/` with a `README.md` on day one, even with no package in it,
saying what is reserved and why it is not published. Not decoration: the layout
is a decision, and a reader who finds an empty directory concludes it is a
leftover and flattens it — which un-decides the decision in §1 silently.

The README says four things: what is duplicated today, which package will hold
it, what both apps will name it, and that it does not publish. `self-learning`'s
and `content-hub`'s are the shape to copy.

## 3. A package here does not publish, and that is structural

`"private": true` in the package's manifest, and no `publishConfig`. `bun
publish` refuses a private package outright, so the rule is enforced by the tool
rather than remembered. No changeset, no `version` in the release sense — the
number in `version` is decoration inside one repository, and `workspace:^` reads
`bun.lock`, not that field.

Consumed as `"@<product>/schema": "workspace:^"` — **never `workspace:*`**. The
caret is what makes the range survive being packed; `*` is meaningless to
anything outside bun.

If a package here ever genuinely needs to be published, it does not belong here:
move it to `nxgt-core` and pay the release cost deliberately. A package that is
half-published is the worst of both — see `nxgt-package`'s
`release-a-package-change`.

## 4. The root manifest is private, and its scripts fan out

```json
{
	"name": "<product>",
	"private": true,
	"workspaces": ["apps/*", "packages/*"],
	"scripts": {
		"dev": "bun run --filter '*' dev",
		"build": "bun run --filter '*' build",
		"typecheck": "bun run --filter '*' typecheck",
		"check": "biome check",
		"test": "bun run --cwd apps/api test",
		"e2e": "bun run --cwd apps/ui e2e",
		"docker:up": "docker compose --profile prod up -d",
		"docker:dev": "docker compose --profile dev up -d"
	},
	"overrides": { "graphql": "~16.14.2", "typescript": "~6.0.3" }
}
```

- **`--filter '*'` for what every workspace has**, `--cwd <app>` for what one of
  them has. `test` and `e2e` are not the same kind of check and do not both live
  in every app — see §8.
- **`overrides` keeps one copy of a peer two workspaces disagree about.** One
  `graphql` in the tree or the API's resolver types and the UI's generated
  documents are typed against different modules. `typescript` is pinned because
  it is a declared peer of the `@nxgt/*` packages.
- **One `biome.json` at the root**, one `tsconfig.base.json`. An app-level config
  extends; it does not restate.
- Workspace names are `@<product>/api`, `@<product>/ui`, `@<product>/schema` —
  the product is the scope, and it is not `@nxgt`. `@nxgt` means *published by
  nxgt-core*, and nothing here is.

**The repository name has no `nxgt-` prefix.** `nxgt-*` is the platform layer —
the packages, the stack, the docker parc. A product is `self-learning`,
`content-hub`, not `nxgt-self-learning`.

## 5. One build context, one install, one target per process

`docker/Dockerfile` at the root, a `base` stage that copies the manifests and
`bun.lock` before the sources, `bun install --frozen-lockfile` once, then one
target per process and one `*-dev` target per process:

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json biome.json ./
COPY packages ./packages
COPY apps ./apps
RUN bun install --frozen-lockfile        # postinstall codegen runs here

FROM base AS api
ENV NODE_ENV=production
RUN cd apps/api && bun run build
USER bun
CMD ["bun", "run", "--cwd", "apps/api", "start"]

FROM base AS api-dev                     # FROM base, NOT FROM api
ENV NODE_ENV=development
USER bun
CMD ["bun", "run", "--cwd", "apps/api", "dev"]
```

Four things in there are load-bearing, each for a measured reason:

- **`cd apps/api && bun run build`, not `bun run --cwd apps/api build`.** The
  `--cwd` form has printed bun's own help text and exited **0** in this
  organisation's images: the build silently did not happen, and `start` had
  nothing to start. Use `--cwd` in `CMD`, where it works, and `cd` in `RUN`.
- **`--frozen-lockfile` is the reason to copy the lockfile at all.** Without it
  bun re-resolves every range and the image can land on a version this
  repository has never installed — a runtime failure instead of a build one.
- **`*-dev` is `FROM base`, never `FROM <prod target>`.** `FROM api AS api-dev`
  gives the dev image the production build.
- **`USER bun` (uid 1000) in the dev targets.** Those containers write into the
  mounted host tree — React Router's `.react-router/types/`, Vite's caches,
  `logs/`. As root, the files land on the **host** owned by root and the next
  host-side `bun run typecheck` dies with `EACCES: unlink
  .react-router/types/+server-build.d.ts`. It hid for a day, because overwriting
  an existing file keeps its owner: only newly created files were affected.

`oven/bun:1`, not a locally built base image, as long as every dependency comes
from a public registry. That is most of what an extraction buys: no GitHub token
in a build, no sibling checkout on the build machine.

## 6. The compose file is the product's, and it lives at the root

Not under `apps/ui/`. One file describes the product, four services describe the
two apps × two profiles, and the app directories describe neither.

Everything about *what goes in it* — no published port, `STACK_PREFIX` for the
docker namespace, a whole hostname per service, `traefik.enable=true` literal,
the anonymous `node_modules` volumes, `bun -e` health probes — is
`nxgt-compose`'s `compose-a-stack`. **Load that skill for the compose file;** this
one only says where it lives and why there is exactly one.

The one rule that is this skill's: **an app whose only caller is a sibling
container gets no traefik router.** An API behind an SSR UI that attaches the
Bearer server-side is reached at `http://<product>-api:5300/graphql` and has no
hostname at all. An API an SPA calls from the browser must have one, plus a
`CORS_ORIGINS` allow-list — which is one of the four concrete costs of leaving
the token in the browser, and is written down as such in `content-hub`.

## 7. `.dockerignore` is a secret boundary, not housekeeping

The build context is the repository root and the Dockerfile does `COPY apps
./apps`. Without an ignore file, **every `.env*` under `apps/` lands in a
layer** — including the `apps/ui/.env.local` that `bun run register-client`
writes, which holds the product's **Hydra client secret**. `docker history` then
hands it to anyone who can pull the image.

```
.env
.env.*
**/.env
**/.env.*
!**/.env.example
```

Write it in the same commit as the Dockerfile, never after. Every value a
container needs arrives from compose at runtime; nothing needs to be copied in.
And a build **argument** is not a hiding place either — it is recorded in the
image metadata. A secret at build time needs a BuildKit secret mount.

## 8. CI runs what is static, and says out loud what it cannot run

Five steps on `ubuntu-latest`: `bun install`, `bun run check` (biome), `bun run
typecheck`, `bun run build`, and whatever per-app check exists (`check:i18n`).

- **The UI's build is the SSR regression test.** A module that touches `document`
  at import time fails there rather than at the first request — which is exactly
  how `@nxgt/material` once broke a UI in a container whose logs blamed a package
  the repository had never installed.
- **Install without `--frozen-lockfile` in CI** when an app runs codegen from
  `postinstall`: a moved range must not fail a change nobody made. `bun.lock`
  appearing in a diff is then the signal to look. (The *image* still uses
  `--frozen-lockfile` — different job, §5.)
- **Name the checks CI cannot run, in `AGENTS.md`, with what they need.** An API
  suite needing Mongo and Redis on `proxy`, an e2e suite needing a browser and a
  dev server. A check nobody knows is local-only is a check nobody runs.

## 9. `AGENTS.md` carries the product's debts, numbered

An extracted or migrated product arrives with debt. Write it as a numbered list
of **concrete consequences**, not as a regret:

> 1. The access token is in the browser. …
> 2. The API must be public, so it has a router and a CORS allow-list. …
> 3. The UI's backend addresses are baked into its image. …
> 4. `@nxgt/shared-graphql` is pinned at `^1.2.2`, so moving to 2.x means moving
>    to `@nxgt/ory-sdk` in the same commit. …

Each item is checkable, and each one tells the next reader why a file looks the
way it does. Then name the sibling that has already done it: "`self-learning` is
the worked migration of an app exactly like this one" is worth more than a link
to a skill, because it is code that ran.

## 10. A test seam that authenticates everyone must be refusable

A UI whose Playwright suite mocks the network **inside the browser** cannot
answer a question the server asks, so it needs a `MOCK_AUTH` that makes the
middleware invent a signed-in visitor. Fine — with one condition, enforced in the
schema:

```ts
.refine((env) => !(env.MOCK_AUTH && process.env.NODE_ENV === 'production'), {
	message: 'MOCK_AUTH is a test seam and authenticates everyone; it cannot be set with NODE_ENV=production',
	path: ['MOCK_AUTH'],
})
```

The process refuses to start. An authentication bypass is the one failure mode
worth crashing over, and a seam that *can* be switched on in production is not a
seam.

---

## Checking it

```bash
bun install                          # one lockfile, every workspace
bun run check && bun run typecheck && bun run build
grep -rn '"private": true' package.json packages/*/package.json
grep -rn 'workspace:\*' apps packages   # must find NOTHING — `^`, never `*`
grep -c '' .dockerignore              # exists, BEFORE the first build
docker compose --profile prod build   # with no profile: "No services to build"
docker compose --profile dev up -d
docker ps --format '{{.Names}}\t{{.Ports}}'   # the Ports column is empty
```

Then the question that decides whether the layout is right, and it is one
question: **if the schema changed today, how many PRs would it take?** One means
the product is one repository. Two means the package crossed a boundary it did
not have to.
