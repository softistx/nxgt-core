# AGENTS.md

Instructions for any coding agent working in `nxgt-core`.

## What this repository is

The shared `@nxgt/*` packages that `sellix-monorepo` and `nxgt-federation` both
depend on. Until 2026-09-06 each monorepo carried its own copy under
`packages/`, and the copies had forked: `shared-mongo` differed by ~1430 lines,
`shared` by ~260. This repository is the single copy, published to the public
npm registry.

It holds thirteen packages: the nine extracted from `sellix-monorepo`, the two
that existed only in `nxgt-federation` — `shared-events`, `shared-graphql` —
`env`, written here on 2026-09-22 and the first with a `bin`, and `i18n-vue`,
written here on 2026-09-27 from the Vue layer of nxgt-mail's
`@nxgt/mail-i18n`, and the first with `.vue` files and a Nuxt module. A
third from `nxgt-federation`, `datasource-rest`, moved to `softistx/nxgt-http`
on 2026-09-14, with its history. `openapi-codegen`, written here and published
from here at 0.1.0, followed it there the same day: its releases from 0.2.0 on
come from nxgt-http.

Nothing here imports application code. The dependency runs one way: apps depend
on these packages, never the reverse.

## Layering

```
shared-logging   shared-openapi   shared-events   i18n   env   i18n-vue   (no internal dependencies)

package             depends on
shared-exceptions   i18n
shared              shared-logging, shared-events
shared-mongo        shared, shared-exceptions, i18n, shared-logging
security            shared, shared-exceptions, shared-logging
shared-storage      shared-mongo, shared, shared-exceptions, i18n, shared-logging
shared-hono         shared-mongo, security, shared, shared-exceptions, i18n, shared-logging
shared-graphql      shared-mongo, security, shared, shared-exceptions, i18n, shared-logging
```

Each row is a package's direct `@nxgt/*` dependencies, and names only rows
above it. The manifests are the source of truth:
`grep -n '"@nxgt/' packages/*/package.json`.

`env` has no dependency at all, internal or external, on purpose: it is the one
package a repository runs with `bunx` before it has installed anything, and it
carries the only `bin` in the workspace (`nxgt-env`). `build.ts` refuses a `bin`
whose target lacks a `#!` line and `verify:artifacts` runs every declared bin
with `--help`, so both halves of that are checked on the artifact.

**There are no cycles and there must not be one.** A published package cannot
depend on a package that depends back on it — the version bump has no fixed
point and changesets cannot order the release. Federation's `shared` ↔
`shared-events` cycle was broken on the way in; do not reintroduce that shape
by "just re-exporting" something from a lower layer.

## The build, and why declarations are the hard part

Every package is built by the one `build.ts` at the root, which each package
invokes as `bun run ../../build.ts`. There is one script rather than one per
package because they differ only in their entry points. It produces two things:

- **JavaScript**, from `Bun.build` with `packages: 'external'`. A library must
  never bundle its dependencies. `mongoose` above all: its model registry is a
  process singleton, and `@nxgt/shared-mongo` re-exports it, so a second copy
  in the graph means models registered against one connection and looked up on
  another.
- **Declarations**, from `tsc --emitDeclarationOnly` against
  `tsconfig.build.json` — which excludes `*.spec.ts`, while `tsconfig.json`
  still typechecks them.

Entry points are declared per package under `nxgt.entrypoints` in its
`package.json`, and each one must have a matching key in `exports`. A consumer
importing `@nxgt/shared/helpers` resolves through that map; adding a subpath
means adding both.

### Nothing emitted declarations before this repository existed

In the monorepos these packages exported `src/index.ts` directly and
`tsconfig.base.json` set `noEmit: true`. Emitting for the first time surfaced
two classes of failure that a `--noEmit` typecheck can never catch:

**TS2883 — "the inferred type cannot be named".** An inferred return type
whose type lives in a nested `node_modules` path gets that path written into
the `.d.ts`, where it does not exist for a consumer. It hit
`createLogger` (winston, reached through `shared-logging/node_modules`) and
four `MinioService` methods (minio's internal type module). The fix is always
an explicit annotation naming the type through something the consumer can
resolve — `@nxgt/shared-logging` exports `Logger` for exactly this, and
`minio.service.ts` names its result types through the public `Client`
(`Awaited<ReturnType<Client['putObject']>>`) rather than duplicating shapes.

**Hand-written `.d.ts` files are copied, not emitted.** `tsc` passes them
through untouched, so an ambient module augmentation would never reach `dist/`
and the type it declares would silently vanish for every consumer —
`shared-mongo`'s `types/pagination.d.ts`, which declares `Model.paginate`, is
the one that matters most. `build.ts` copies them, and **fails** if a copy
would overwrite something `tsc` emitted: that means a `.d.ts` sits next to a
`.ts` of the same basename and the copy would replace a module's real API with
an ambient file. `shared-logging/src/logger.d.ts` was exactly that, a dead
duplicate of `src/types/hono.d.ts`, and it was deleted.

### `export * from` a dependency only works at an entry point

Bun's bundler mis-compiles a star re-export of an **external** package when it
sits in a module below the entry point. It emits a `__reExport(ns, x)` whose
`x` is never declared, so the built file throws a `ReferenceError` the moment
it is imported — before any of its own code runs — while `bun run build` exits
0. It bit two packages here:

| package | was | threw |
| --- | --- | --- |
| `@nxgt/shared-mongo` | `export * from 'mongoose'` in `src/mongoose.ts` | `mongoose2 is not defined` |
| `@nxgt/shared-hono/mcp` | `export * from '@modelcontextprotocol/{hono,server}'` in `src/mcp/helpers.ts` | `hono is not defined` |

**The rule: every `export * from '<external package>'` must live in a file
listed in that package's `nxgt.entrypoints`.** In an entry point Bun emits a
plain `export * from "..."` passthrough and everything works. Both were fixed by
moving the line up into the entry, not by changing what is exported.

A corollary for `@nxgt/shared-mongo`: inside this package, import mongoose's own
types from `'mongoose'` directly. The `@nxgt/shared-mongo` import rule is for
*consumers*; routing internal type imports through `../mongoose` is what forced
the star re-export down below the entry in the first place.

To audit the rule:

```sh
grep -rn --include='*.ts' "^export \* from '[^.]" packages/*/src/
```

Every hit must be an entry point.

### A build that exits 0 is not evidence the artifact loads

Neither defect above was visible to `bun run build`, `bun typecheck` or `biome`.
Only importing the built output catches them, and the workspace never imports
it — `@nxgt/*` resolves to `src/` here.

So before releasing, the packages are installed the way a consumer installs
them and every declared subpath is imported. That is `bun run verify:artifacts`
(`scripts/verify-artifacts.ts`): it packs each package, builds a scratch
manifest depending on the tarballs — with `overrides` pointing every `@nxgt/*`
at its own tarball so transitive ones resolve locally too — installs, and
`await import()`s every subpath in `exports`.

Do not re-derive that by hand: the script reads the package list and the
subpaths from the manifests, so it cannot go stale against them, and it is
already wired into `changeset:publish`, which runs
`build && verify:artifacts && publish.ts`. A release cannot skip it.

`scripts/verify-artifacts.ts` only runs the stages in order and stops at the
first that fails; each lives in `scripts/artifacts/`, one module per
responsibility, with a spec beside each pure one: `packages.ts` reads the
workspace, `tarball.ts` a tarball's entries, `manifest.ts` its dependency
fields, `registry.ts` asks npm, then `stale.ts`, `install.ts`, `load.ts`,
`browser.ts` (the `browser` condition, which only this repository has),
`classes.ts` and `emit.ts`. The split follows nxgt-janus's copy module for module, as
nxgt-data's and nxgt-http's do, so a check added to one copy is a check to
port to the others. All four hold the same three checks, each described
below: the test-code check, the unbuilt-package guard and `missingFiles`, whose
spec holds that a `files` entry `dis` is not covered by `dist/`. `browser.ts`
is this copy's alone. This copy and nxgt-http read a sibling's version from the
packed manifests, where nxgt-janus and nxgt-data read it from the workspace.
Outside `scripts/artifacts/`, `check-changesets.ts` is nxgt-janus's alone.
`check-nxgt-versions.ts`, its spec and `.github/workflows/nxgt-versions.yml` are
copied from nxgt-janus, the script byte for byte but for its header comment
and the spec but for the one package it expects to find (`@nxgt/ory-sdk`);
nxgt-data has a copy too, which also reads `examples/*`. nxgt-http has none:
every `@nxgt/*` package there depends only on its siblings.

Last, it emits the declarations of each package's `test/declarations/*.ts`
against the install, under a consumer's strict settings with this
repository's `@types/bun` (`emit.ts`, from softistx/alxia#87). An exported
value whose inferred type holds a type the entry does not export fails there
with TS2883 ("cannot be named without a reference to …"), and nowhere else:
inside the workspace a package resolves to its own folder through a symlink,
so tsc names the type by a relative path, even with the declaration build
on. `shared-hono`'s fixture is an app made of its middleware — `currentUser`,
`oryAuth`, `oryChecks`, `requireAuthenticated`, `secured`, `ketoCheck`,
`acceptQuery`, `rateLimiter`, the error handler — plus the `openapi-fetch`
client and `createMcpServerApp`; `shared-graphql`'s the Yoga plugins, the
Keto checker and the Hono mount. A middleware, plugin or builder whose type
ends up in an app's gets a case there. Neither package's `tsconfig.json`
includes `test/`, so this stage is the only compiler that reads the
fixtures; Biome lints them, and they are never built or shipped. `emit.ts`
takes the tsc run as a parameter, so `emit.spec.ts` covers it without a
pack, and it compiles with Bun's types where alxia's #87 had `types: []`,
which made a type from `bun` an error type that `skipLibCheck` hid.

It fails a `files` entry the tarball holds nothing under, with
`<package>: files lists <entry>, which the tarball does not hold — build it
first, or drop it from files` — npm skips such an entry without a word, and
six packages ship a folder beside `dist/` that only `files` names: `schema/`,
`graphql/` and `openapi/` in `security`, `shared-graphql` and
`shared-openapi`, and `docs/` in `env`, `i18n-vue`, `shared-graphql` and
`shared-hono`.

It also fails a tarball that ships test code — a `*.spec.*`, a `*.test.*`, a
snapshot, or a `<subject>.fixtures.*` — with
`<package>: the tarball ships test code: <path>`. A plain `fixtures.*`
passes: the dotted prefix is what marks the fixtures specs share. Every
`tsconfig.build.json` excludes `test/` and `**/*.spec.ts`, and no `src/`
holds any other kind, so no tarball holds any today; this check is what holds
that. `TEST_CODE` in `tarball.ts` and `NOT_A_BUILD_INPUT` in `stale.ts` name
the same files, so a spec's fixtures cannot make `dist/` stale either; a new
kind of test file belongs in both. And a package with no `dist/` stops it before packing with
`<package>: no dist/` and "Run `bun run build` first" — until 2026-09-27 it
crashed on a raw `ENOENT` instead, because on Bun 1.4.2 `Bun.Glob().scan`
throws on a missing `cwd`.

This is also the only check that exercises `files`, `exports` and the
`workspace:*` -> version rewrite that `bun pm pack` performs.

### `stx-sdk` is a declared peer, and what the 404 really was

`@nxgt/shared-hono` and `@nxgt/shared-graphql` import `stx-sdk/auth` and
`stx-sdk/ory`. For a while this repo named `stx-sdk` in no manifest at all,
because a published version had broken every consumer's `bun install` with
`GET https://registry.npmjs.org/stx-sdk - 404`, and the conclusion drawn was
that Bun installs a peer even when it is marked optional. **That conclusion was
wrong**, and it is worth knowing why, because it cost a real declaration.

Measured on Bun 1.4.0, by packing three throwaway packages and installing each
in an empty directory:

| what the published manifest declares | consumer's `bun install` |
| --- | --- |
| optional peer on a package that is on no registry (`*`, `>=1.0.0`, `^1.0.0` — the range is irrelevant) | **exit 0** |
| **required** peer on a package that is on no registry | **exit 1**, `404` |
| `link:` in `devDependencies` | **exit 0** |

The manifest that actually broke consumers declared
`peerDependencies: {"stx-sdk": "*"}` and **no `peerDependenciesMeta` at all** —
a required peer. `optional` was never in it. So Bun behaves exactly as
documented, and the ordinary rules hold:

- A dependency's `devDependencies` are never installed by a consumer, `link:`
  included. It is untidy in a public manifest, not harmful.
- An optional peer is safe to declare whatever the range.
- **A required peer that resolves nowhere fails the install.** That is the only
  shape to avoid, and it is the one that was shipped.

`stx-sdk` is now published to the public npm registry under its own name, so it
is declared honestly: a peer of both packages, and a root devDependency so the
workspace typechecks. Nothing needs a checkout next door any more — which is
what kept CI red, since a GitHub-hosted runner has no `../stx-sdk` and
`tsc --emitDeclarationOnly` cannot emit past a missing module.

`@nxgt/material` and `@nxgt/map` are still on no registry and will stay there —
`@nxgt/material` for licence reasons, since it vendors Font Awesome Pro assets.
Anything here that comes to need them must declare them **optional**, or not at
all. Never as a required peer.

### Registry configuration lives in `bunfig.toml`, never in `.npmrc`

Bun is the package manager here, so `bunfig.toml` is where the registry and the
publish credential are declared:

```toml
[install.scopes]
"@nxgt" = { url = "https://registry.npmjs.org", token = "$NPM_TOKEN" }
```

Installing `@nxgt/*` needs no credential at all — they are public — and with
`$NPM_TOKEN` unset Bun simply omits it and installs fine. That was measured, not
assumed.

A `.npmrc` gets the same job wrong in a way that is hard to diagnose. There,
`//registry.npmjs.org/:_authToken=${NPM_TOKEN}` with the variable unset expands
to an **empty** token, which is sent as an `Authorization` header and answered
with `401 Unauthorized` — and because a project `.npmrc` overrides the user one,
being logged in through `npm login` stops working *inside the repo only*, while
the same command one directory up succeeds. This repository had that file and it
was deleted. Do not reintroduce it.

### The build must run before typecheck and tests

Every package's `exports` map points at `./dist/*`, so a workspace sibling only
resolves once it has been built. On a clean checkout `bun run typecheck` reports
around a hundred `TS2307: Cannot find module '@nxgt/…'` — not real errors, just
an unbuilt tree. `bun run test` is in the same position: some specs load a
sibling's built output.

Locally this never happens, because a stale `dist/` is always lying around. It
appears only in CI, which is why the workflow builds first. `bun run --filter`
builds in dependency order, so building from nothing works.

**A sibling that is only a peer is not an order.** `bun run --filter` reads
`dependencies` and `devDependencies`, not `peerDependencies`: when
`@nxgt/i18n-vue` declared `@nxgt/i18n` as a peer alone, the two built at once,
`i18n`'s `rm -rf dist` landed first, and `i18n-vue`'s declarations failed on
`Module '"@nxgt/i18n"' has no exported member 'Path'`. A sibling peer is also
a `devDependency` (`workspace:^`), which is what orders the build.

If you see a wall of TS2307 on `@nxgt/*`, run `bun run build` before believing
any of it.

### CI runs on GitHub-hosted runners, unlike the private repos

`nxgt-material` and `stx-sdk` use `runs-on: self-hosted` because they are
private and minutes are metered. This repository is public, so GitHub-hosted
minutes are free — and the estate's single self-hosted runner is a VPS that is
not always online. CI here sat queued for an hour behind it before the switch.
Do not copy `self-hosted` in from a sibling repo.

The consequence for `verify:artifacts`: a hosted runner has no sibling
`../stx-sdk` checkout, so the subpaths importing it are reported **skipped**
rather than failed. A different error from those same subpaths still fails.

**CI lints with the Biome `bun.lock` resolved**: `bunx biome ci`, the version
`bun run check` runs locally, and the one `biome.json`'s `$schema` names. Not
`biomejs/setup-biome` with `latest`, which linted CI with a newer Biome than
anyone ran locally. Raising Biome is a lock bump that moves the `$schema` with
it.

**Every job has a `timeout-minutes`**, sized from the 60 runs of each measured
up to 2026-09-27: 8 for CI, whose job took 1 to 2¼ minutes, and 10 for the
release, which took under two — generous, since a publish killed half-way is
worse than one waited on. Past it a run is hung, and the six-hour default holds
the runner for nothing. The weekly `nxgt versions` job, which only asks the
registry and `gh`, has 5, as nxgt-janus's does. `ci.yml` has nxgt-janus's
`concurrency` group: a pull
request's new push cancels its run in progress, and a push to `develop`, were
CI ever to run on one, never would. The release keeps its own group, which
never cancels a run under way.

### graphql 17 is a tested peer, not a hoped-for one

`@nxgt/shared-graphql` peers `graphql` by `^16.9.0 || ^17.0.0`, and `bun.lock`
holds a 16. The second half was not free: on graphql 17 `getDirective` stops
applying an input field's default, so every term of 2.x's `@check` without an
explicit `id` refused the schema at build — which is why `readPermissions`
applies `@permission`'s defaults itself. `bun run test:graphql17`
(`scripts/graphql-17.ts`, spec'd beside it) moves the package's `graphql`
devDependency to 17, installs, asserts 17 is what resolves, runs the package's
typecheck and suite, and puts `package.json` and `bun.lock` back whatever
happened. CI runs it after the artifact check. `@nxgt/security` depends on
graphql 17 directly and is not part of this run.

### A new `@nxgt/ory-sdk` is found by a schedule, not by memory

Three packages peer `@nxgt/ory-sdk` by `>=0.1.0 <1` —
`@nxgt/security` as an optional peer, `@nxgt/shared-hono` and
`@nxgt/shared-graphql` as required ones — and their specs run only the version
`bun.lock` holds: a new 0.x release is admitted
by the range the day it is published and tested by nobody until the lock is
bumped. The `<1` ceiling, set in `@nxgt/shared-graphql` 3.0 on the owner's
decision, keeps a breaking 1.0 out until a release here raises it. `bun run nxgt:outdated` (`scripts/check-nxgt-versions.ts`, spec'd
beside it) lists every `@nxgt/*` devDependency of a package that is not a
sibling and whose locked version is behind npm's `latest`: exit 0 when all are
current, 1 when something is behind, 2 when the registry did not answer, which
is never read as "current". The `nxgt versions` workflow runs it every Monday
and on `workflow_dispatch`; something behind opens the issue *@nxgt/\*
devDependencies behind npm latest*, or updates the one open, and fails the run,
and a later run with nothing behind closes it. The bump is a pull request like
any other: the root `package.json`'s devDependency and `bun.lock` in one
commit, and the three packages' suites run. The check finds it through
`@nxgt/security`'s own devDependency on it, since it reads `packages/*` and not
the root manifest. A lock bump changes nothing
published, and `changeset status` passes without a changeset when only the
root manifest moved. Not Dependabot: its Bun updater reads `bun.lock` up to
`lockfileVersion` 1, and this one, from Bun 1.4.2, is 2.

The peer ranges themselves — `>=0.1.0 <1` since the owner set the ceiling —
are the owner's decision and are not moved by a lock bump.

### Publishing needs a granular access token, and you cannot tell by looking

npm no longer accepts a classic token for publishing, whatever the account's
2FA setting. The failure is explicit:

```
403 Forbidden — Two-factor authentication or granular access token with
bypass 2fa enabled is required to publish packages.
```

Generate a **Granular Access Token** on npmjs and put it in `NPM_TOKEN` — in
the environment locally, and in the `NPM_TOKEN` secret for CI.

**There is no read-only probe that classifies a token.** An earlier version of
this file claimed `GET /-/npm/v1/tokens` answers `200` for a classic token and
`401` for a granular one. It does not: the granular token that published the
twelve answers `200` there and returns its username from `/-/whoami`, exactly
like a classic one. That table sent two diagnoses down the wrong path, and it
is gone. Both token types are 40 characters starting `npm_`, and the only
statement those endpoints support is a negative one:

| observation | what it actually means |
| --- | --- |
| `401` on `/-/whoami` | the token is dead — revoked, expired, or not a token at all |
| `200` with a username | the token authenticates. Nothing more. Not its type, not what it may write |

So **the only test for "can this token publish" is a publish.** `bun publish
--dry-run` does not authenticate, so it proves nothing here. Run
`scripts/publish.ts`: it skips anything already on the registry, so it is safe
to re-run, and it names the two failures that mean something:

- `403 … two-factor authentication or granular access token` — the token is
  classic. Generate a granular one.
- `404 … does not exist in this registry` — the token is granular but has no
  write permission on that name. Fix the scope selection, below.

**When creating the granular token, select the *scope*, not packages.** Under
*Packages and scopes* → *Read and write*, choosing "only select packages" and
searching for `@nxgt/…` finds nothing on a first release — none are published
yet — so the token is issued covering zero packages, and every publish 404s in
a way that reads like a missing package. Pick **All packages**, or add the
`@nxgt` **scope** entry.

**Check which token you are actually sending.** `~/.npmrc` and `$NPM_TOKEN` can
hold different values, one of them stale, and the publish path reads the
environment through `bunfig.toml`. Compare them by hash before concluding
anything about permissions — never by printing them:

```sh
printf %s "$NPM_TOKEN" | sha256sum | cut -c1-12
```

An hour went into "the token has no scope" when the truth was that the two
files disagreed and the dead one was being read. Note also that a `.npmrc`
written as `_authToken=$NPM_TOKEN` is expanded by **Bun** but not by **npm**,
which needs `${NPM_TOKEN}` — so the same file can work for `bun publish` and
401 for every `npm` command.

### The release PR opens itself — since 2026-09-06

`changesets/action` versions the packages, pushes `changeset-release/develop`
and opens the "Version packages" pull request. Merging *that* publishes and
tags. Nobody has to open it.

It used to fail there:

```
HttpError: GitHub Actions is not permitted to create or approve pull requests.
```

Two switches carry that message, both named *Settings → Actions → General →
Workflow permissions*, and both had to be turned on — the **organisation** one
on `softistx`, and the **repository** one on `nxgt-core`. Each needs *Read and
write permissions* as well as the *"Allow GitHub Actions to create and approve
pull requests"* checkbox: the action pushes the branch before it opens the PR,
so the checkbox alone is not enough.

If the error comes back, read the repository's state rather than guessing which
of the two moved:

```bash
gh api /repos/softistx/nxgt-core/actions/permissions/workflow
# {"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}
```

Note the organisation setting does **not** propagate: `nxgt-material`,
`nxgt-map` and `stx-sdk` are still `read`/`false`, so the day one of them starts
releasing, its own switch has to be turned on too.

CI skips the changeset check on `changeset-release/develop`, since that is the
branch that consumes them.

**An empty changeset will not test any of this.** `changesets/action` logs
`All changesets are empty; not creating PR` and stops before it versions,
pushes or opens anything — so the step that used to fail is never reached. The
only test is a real release.

### `bun publish`, not `changeset publish`

`changeset version` does the versioning and the changelogs — pure bookkeeping,
it touches no registry, and it stays. But `changeset publish` shells out to
**npm**, which would publish with a different package manager than the one
everything here is built and verified against.

So `scripts/publish.ts` does it: dependency order, skips any version already on
the registry, and `bun publish` for the rest. `changesets/action@v2` no longer
parses `New tag:` from stdout; it reads NDJSON events from the file in
`$CHANGESETS_OUTPUT` (`{"type":"git-tag","tag":"<name>@<v>","packageName":"<name>"}`).
The script writes those, creates the local git tag, and still prints `New tag:`
so a leftover `@v1` runner is not silently broken. Do not drop the file write
— without it the packages land on npmjs and GitHub releases never appear.

### Why npmjs and not GitHub Packages

Asked and settled; do not reopen it without a new fact. GitHub Packages
requires the npm scope to equal the repository owner's login, and `@nxgt` is
unreachable there — the `nxgt` GitHub org has existed since 2017 and is not
ours. Publishing under `@softistx` was tried, and abandoned for the reason that
actually decides it: **GitHub Packages demands a token to install, even for a
public package.** That is a secret in every CI job and every Docker build in
both monorepos, forever, on the same path where nxgt-docker's old
`images/bun/script.sh` already leaked one through `--build-arg` — the leak that
`images/bun/build.ts` was written to close, by passing it as a BuildKit secret.

npmjs public costs nothing, needs no token to read, and let the `@nxgt` scope
stay — which is why not one `import` in either monorepo changed.

The repository lives in the `softistx` GitHub org; the npm scope is `@nxgt`.
On npmjs those are unrelated, so the mismatch is not a mistake.

### An asset is only shipped if it is outside `dist`

`bun build` bundles code. Nothing else lands in `dist`, so a `.graphqls`, a
YAML file or a font that only exists under `src/` is simply absent from the
tarball — and inside this workspace nothing notices, because `@nxgt/*` resolves
to `src/`. `@nxgt/shared-graphql` published its resolvers without the SDL they
resolve for two releases; the first consumer to install it from the registry
died on `Unknown type: "Void"`.

Assets live in their own top-level directory, named in `files`: `graphql/` for
`@nxgt/shared-graphql`, `openapi/` for `@nxgt/shared-openapi`.

A path a consumer globs must resolve against the **package root**, not against
a fixed depth from the calling file: the bundle is `dist/index.js`, the source
is `src/utils/schema.utils.ts`, and no single relative path serves both. See
`SHARED_SCHEMA_PATH`, which walks up to the nearest `package.json`.

### A shipped directive is not a composed directive

`@permission` is declared in
`graphql/directives/permission.graphqls`, inside the
`graphql/**/*.graphqls` glob `SHARED_SCHEMA_PATH` already exposes — not in
`SHARED_TYPE_DEFS`. That is the difference between a subgraph seeing it and
not: `health` and `platform` build through `buildSubgraphSchema` and never load
`SHARED_TYPE_DEFS`, so a declaration put there would be invisible to exactly
the schemas most likely to want it next.

Shipping the SDL is enough for a **standalone** Yoga schema. It is **not**
enough for a subgraph that federation composes. The day `@permission` is used
in `health` or `platform`, rover needs both:

- `@composeDirective(name: "@permission")` in that subgraph, and
- the directive named in the subgraph's own `@link` import list.

Without them the composition **drops it silently** — the supergraph SDL comes
out valid, the field loses its check, and nothing fails. Nobody is doing this
today; `apps/supergraph/supergraph.yaml` composes only those two subgraphs and
neither carries a `@permission`. Read this before the first one does.

`@authenticated` goes the other way: federation owns that name, with no
argument, and a subgraph imports federation's declaration. So the `type:`
form (`AUTHENTICATED_DIRECTIVE_SDL`) lives in `SHARED_TYPE_DEFS` and not in
`graphql/`, `FEDERATION_DIRECTIVES` keeps federation's shape, and
`applyAuthenticated` reads a declaration without `type` as "any caller".

### A caller is never read from what the client writes alone

`useAuth()` and `extractJwtPlugin()` read the caller from the GraphQL
request's `extensions` — the body, which the client writes. Up to
`@nxgt/shared-graphql` 2.x they did so unconditionally, and a client that
reached a subgraph directly could name itself anyone. Since 3.0 they read it
only for a request `trustedGateway` vouches for (`gatewaySecret`: a shared
secret, constant-time, 16 characters at least), and throw at construction
without one. Do not add a default that trusts the body, nor a
`trustedGateway` that always answers `true`: the specs send forged
`extensions` to a Yoga server through `yoga.fetch` and to an `ApolloServer`
through `executeOperation` (with a hand-built `HeaderMap`) to hold this.

`@nxgt/shared-hono` had the same flaw in headers: `currentUser()` built the
caller from the `X-User-*` headers of any request, and `oryAuth()` did too
whenever `NODE_ENV` was `test`. Since 4.0 `currentUser()` takes the same
`trustedGateway` and throws without one; `oryAuth(ory, { trustedGateway })`
reads a route spec's mock headers only with it **and** under `NODE_ENV=test`;
`principalFromMockHeaders` needs it. A request without the proof is ignored,
not refused, as in shared-graphql. The specs send forged headers through
`app.request` — with no secret, a wrong one and a prefix of it — and assert
that `secured()` answers 401. The `X-User-*` reader itself
(`principalFromUserHeaders` in `middlewares/gateway-trust.ts`) is not
exported, so no caller can reach it without passing the trust first.

**One definition, in `@nxgt/security/gateway`.** `gatewaySecret`,
`GATEWAY_SECRET_HEADER`, `requireGatewayTrust`, `assertGatewaySecret` and the
`GatewayTrust` types live there. Both packages re-export `gatewaySecret`,
`GATEWAY_SECRET_HEADER` and the types — `security` sits below both in
the layering, so the dependency points the right way, and the subpath imports
nothing. Each package also exports a `requireGatewayTrust(options, caller)`
of its own — security's name with a different signature, on purpose: it is
the one a middleware author calls — which words the error for its own source
(`the request's extensions`, `the X-User-* headers`) and its own alternative
(`useOryAuth(ory)`, `oryAuth(ory)`).
Change the proof there, never in one package.

### Siblings are depended on by range — `workspace:^`, never `workspace:*`

`workspace:*` publishes as the **exact** version. That is not a cosmetic
difference: `@nxgt/shared-hono@1.0.2` went out demanding
`@nxgt/shared-mongo@1.0.0`, while the consuming app's own `^1.0.0` resolved to
`1.1.0`. Bun's isolated linker is right to install both — and both register the
`Audit` and `Migration` Mongoose models, so the second one throws
`OverwriteModelError`. It cost 52 failing specs in nxgt-federation, and
sellix-monorepo had been carrying two copies of `@nxgt/shared-mongo` since its
first install without anyone noticing.

`workspace:^` publishes as `^1.0.0`, which dedupes. `verify-artifacts.ts` fails
the build on an exact sibling pin, so a new package cannot reintroduce it.

**And the range is substituted from `bun.lock`, not from the sibling's
`package.json`.** `changeset version` rewrites every manifest and leaves the
lockfile untouched, so a publish that follows it directly ships yesterday's
numbers: `@nxgt/shared-graphql@2.0.0` and `@nxgt/shared-hono@3.0.0` went to the
registry asking for `@nxgt/security@^3.2.1` while their `dist` imported the
4.0.0 API. Every range was a well-formed caret, the install succeeded and the
types checked — and the consumer got both majors, the 3.2.1 copy still reaching
`stx-sdk/ory`, so `OryUnavailable` crossed a class boundary and an Ory outage
answered 500 instead of 503.

`changeset:version` is therefore `changeset version && bun install`, and the
**updated `bun.lock` belongs in the Version Packages PR**. `verify-artifacts.ts`
fails any tarball whose sibling range excludes the sibling being published
beside it, which is the check that would have caught it.

### `typescript` is a peer, pinned to 6, and it is load-bearing

Every package declares `typescript: ^6.0.3`. Two arrived from `nxgt-federation` on
`~7.0.2`, which is not a preference difference — the ranges are mutually
unsatisfiable, so a consumer installing the set gets a peer conflict, and if
TypeScript 7 wins, `@nxgt/shared-openapi` **throws at import**: it evaluates
`ts.factory.createTypeReferenceNode(...)` at module scope, and TS 7's default
export has no `.factory`. Every app in both monorepos builds on 6.0.3. Do not
raise this range in one package alone.

## Releasing, and what it means for a consumer

Changesets, independent versions. `bun changeset` describes a change; merging to
`develop` opens a "Version packages" PR; merging that PR publishes to the public
npm registry.

CI enforces two things a green build does not:

- **`bun run changeset:status`** — a change under `packages/` without a
  changeset is a change that never reaches a consumer, because the release
  workflow has nothing to version. Use `bun changeset --empty` when that is
  genuinely intended, and say why.
- **`bun run verify:artifacts`** — packs every package, installs them the way a
  consumer does, imports every subpath each package declares, and rejects a
  manifest that would break an install — a `link:` or `file:` in a field a
  consumer resolves, or a **required** peer that is on no registry — and a
  package that is not MIT or ships no `LICENSE`, or a tarball that ships
  test code or holds nothing under one of its `files` entries. It reads the
  subpath list from each `exports` map, so a new entry point is covered as
  soon as it is declared.
  `changeset:publish` runs it too, so a broken artifact cannot be published.

### Every package is MIT, and ships its own `LICENSE`

The root `LICENSE` is MIT, and each `packages/*/` holds a copy, named in
`files`: npm ships only the `LICENSE` in the package's own directory, never
the root's. A new package copies it and declares `"license": "MIT"`. Change
the copies together. `@nxgt/material` is the exception the licence is about,
and it is not a package of this repository.

### Bins and optional peers

`@nxgt/openapi-codegen` was the first package here with a `bin` and with
optional peers; it now lives in `softistx/nxgt-http`. Today `@nxgt/env`
carries the one bin, and `@nxgt/security` (`@nxgt/ory-sdk`) and
`@nxgt/i18n-vue` (`vite`, `nuxt`, `@nuxt/kit`) the optional peers. Both
checks run on the artifact, not the source:

- **A bin runs as a file.** `build.ts` refuses a `bin` target that is missing
  or lacks its `#!` line, and marks each one executable; `verify:artifacts`
  then runs every declared bin with `--help` from `node_modules/.bin`, and
  fails on a non-zero exit.
- **An optional peer is installed on purpose.** A consumer gets one only by
  asking for it, so `verify:artifacts` adds every optional peer that is on
  the registry to its probe project. A subpath that needs one therefore
  loads because the peer was requested, not because another package's peer
  happened to hoist it. Code that needs an optional peer must import it
  only on the path that uses it (codegen's `lint` imported
  `@redocly/openapi-core` dynamically), so the rest of the package loads
  without it. `@nxgt/i18n-vue` does it by subpath instead: only `/vite` and
  `/nuxt` import an optional peer, and its main entry never imports them.

Publishing goes through **`bun publish`**, never `npm publish` — Bun is the
package manager for this repo, and `bun pm pack` is what rewrites `workspace:*`
into a real version. `npm` is only ever used to write a credential into
`~/.npmrc`, which is where Bun reads it from.

The full sequence, and the reasoning behind each step, is the
`release-a-package-change` skill.

**A fix in a package is a release before it is a consumer PR.** This is the
constraint the split introduced, and it is the same one `nxgt-ory` introduced
for Keto namespaces: nothing in `sellix-monorepo` or `nxgt-federation` compiles
against an unpublished change, and nothing warns you. Sequence it as: change
here → release → bump the dependency in the consumer.

To try a change without releasing, `bun run build` here and `bun link` the
package in the consumer. Remember to undo it — a stale link is indistinguishable
from a published version until it isn't.

## Deliberate duplication — do not "clean this up"

Reconciling the two forks kept both behaviours wherever they genuinely differed,
because none of the severe conflicts was covered by a test on either side and
picking a winner would have silently changed production behaviour in one repo.
The following pairs exist on purpose:

| Both kept | Why |
| --- | --- |
| `paginate` (offset) and `paginateCursor` (Relay) | sellix pages by offset, federation by cursor; same name, incompatible signatures |
| `Principal` and `TokenPrincipal` | gateway-header shape vs JWT-claims shape — two different models of "the authenticated caller" |
| the REST filter helpers and the GraphQL filter DSL | two filter philosophies that shared a filename and two function names |
| `objectIdFromString` and `toObjectId` | the same conversion under two names; one aliases the other |
| `honoLanguageSource` in `shared-hono/src/i18n/language.ts` and its copy in `shared-graphql/src/integrations/hono.ts` | `@nxgt/i18n` knows no server since 2.0: each Hono integration registers the request's language. `shared-graphql` does not depend on `shared-hono`, and an app may serve Yoga without it. Change both together |

Converging each pair onto one implementation is real work with real decisions
in it. It is not a tidy-up, and it is not this repository's to do unasked.

## Conventions

Inherited from both monorepos and unchanged:

- **Mongoose is imported from `@nxgt/shared-mongo`**, never directly from
  `mongoose`, in every package above it in the layering. `shared` is the one
  exception: it declares `mongoose` directly and is the layer `shared-mongo`
  builds on.
- Biome for formatting and linting: tabs, single quotes. `bun biome check
  --write` before committing. In a `.vue` file Biome reads the `<script>` and
  not the `<template>`, so it reports a binding used only in the template as
  unused: `biome.json` turns `noUnusedVariables` and `noUnusedImports` off for
  `**/*.vue`, and `vue-tsc` is what checks them.
- Commit messages: `<type>: <Capitalized summary>`, types `feat`, `fix`,
  `update`, `chore`, `docs`, `typo`, and `ci` for the workflows and the setup
  action.

Established here, and applying to all four repositories:

- **A script is a TypeScript file run by Bun, using Bun Shell — not a `.sh`.**
  `scripts/publish.ts` and `scripts/verify-artifacts.ts` are the references:
  `$` gives you the pipes and globs that made shell worth using, and everything
  around them is a typed language with real arrays, real errors and a stack
  trace. Repository chores are full of data — manifests, versions, tarball
  contents, registry answers — and bash is the wrong language for data. The
  skill is `write-a-repo-script`.
- **A published schema is a promise, and the runtime has to keep it.**
  `@nxgt/shared-openapi` shipped a `sort` on the generic `SearchRequest`, plus
  `SortField` / `SortOrder` / `SortDirection`, for a paginator that has never
  read `sort` — `cursorPaginate` orders by `_id`, because the cursor *is* the
  `_id`. Twenty-three sellix endpoints documented sorting and discarded it, and
  no build, lint or test could see it: the parameter type-checked, validated,
  and went nowhere. When you add a field to a shared schema, follow it to the
  code that consumes it in the same change, or do not add it.
- **A package's `README.md` is its page on npmjs.** It is published, and it is
  read by someone who has never seen this repository and does not know the
  private applications that consume it. Organize by section, each with a
  concise copy-paste example; never name a private app, a private monorepo,
  or "the parc" there — those names belong in this file. The long version
  is the package's `docs/` folder, named in `files` — `env`, `i18n-vue`, `shared-graphql` and `shared-hono` have one;
  the `nxgt-docs` agents write it: guide pages with the
  detail and an example for each point, `troubleshooting.md` headed by the
  exact error a consumer sees, and `roadmap.md`, with no dates. The bar is
  `keep-docs-current`. Ten of the twelve shipped `bun init` boilerplate
  until 2026-09-06, five of those under the wrong package name.

## Known state

`bun run test` is **592 pass, 9 skip, 0 fail** on 2026-09-28: 558 in the
packages (the 9 are `shared-storage`'s S3 suites; `i18n-vue`'s 115 include a
real `nuxt build`), then 43 in `scripts/`, 16 of them
`check-nxgt-versions.spec.ts`'s. Treat any failure as yours.

That is `bun run --filter '*' test` — **one process per package**, not one
`bun test` for the whole workspace. Running the packages together in one
process produced 6 failures and 3 errors, and not one of them belonged to the
test that reported it:

| symptom | actual cause |
| --- | --- |
| `crypto.subtle.generateKey is not a function` in `shared-hono` | another file's mock still installed on the global |
| `OverwriteModelError: Cannot overwrite 'Migration'` | the model module evaluated twice in one process |
| `MONGODB_URI is required` | `--env-file=.env.test` lives in the package's own `test` script, which the root run never invoked |
| 6 × `shared-storage` | no S3 configured, plus a fixture path resolved against the working directory |

So each package with specs carries `"test": "bun test src"`, `shared-mongo`
keeps its `--env-file=.env.test`, the `Migration` model reuses an already
compiled one, and the S3 suites skip themselves unless all four `S3_*`
variables are set — infrastructure that is absent is not a failing test.

Then `bun test ./scripts/` runs the repository scripts' own specs, which no
package's run reaches. The `./` and the trailing slash matter: a bare
`bun test scripts` is a substring filter, and on 2026-09-27 it ran 254 tests
across 30 files, every plugin spec under a `scripts/` folder included.

CI starts a single-node MongoDB **replica set** (the migration suite asserts on
transactions) and passes `MONGODB_URI` in the environment, which beats
`--env-file`. There is no S3 in CI, so those suites report as skipped there.
