# AGENTS.md

Instructions for any coding agent working in `nxgt-core`.

## What this repository is

The shared `@nxgt/*` packages that `sellix-monorepo` and `nxgt-federation` both
depend on. Until 2026-09-06 each monorepo carried its own copy under
`packages/`, and the copies had forked: `shared-mongo` differed by ~1430 lines,
`shared` by ~260. This repository is the single copy, published to GitHub
Packages.

It currently holds the nine packages extracted from `sellix-monorepo`.
Federation's three that exist nowhere else — `datasource-rest`,
`shared-events`, `shared-graphql` — arrive with the reconciliation of its own
copies.

Nothing here imports application code. The dependency runs one way: apps depend
on these packages, never the reverse.

## Layering

```
shared-logging   shared-openapi        (no internal dependencies)
      └─ i18n
           └─ shared
                ├─ shared-exceptions
                └─ shared-mongo
                     ├─ shared-storage
                     ├─ shared-hono
                     └─ security
```

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

So before releasing, install the packages the way a consumer does and load them:

```sh
for d in packages/*/; do (cd "$d" && bun pm pack --destination /tmp/probe/tarballs); done
# a scratch package.json depending on the twelve tarballs, with `overrides`
# pointing every @nxgt/* at its tarball so transitive ones resolve locally too
bun install && bun run smoke.ts   # await import() of all 23 declared subpaths
```

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

### The release PR has to be opened by hand

`changesets/action` versions the packages, pushes `changeset-release/develop`
and then tries to open the "Version packages" pull request. That last step
fails:

```
HttpError: GitHub Actions is not permitted to create or approve pull requests.
```

There are **two** switches, both named *Settings → Actions → General →
Workflow permissions → "Allow GitHub Actions to create and approve pull
requests"*, and the message is the same whichever one is off:

- the **organisation** one on `softistx` — on since 2026-09-06. While it was
  off a repository admin could not override it, and the API answered
  `409 Write permissions for workflows are disabled by the organization`.
- the **repository** one on `nxgt-core` — still off. Check it without leaving
  the terminal:

  ```bash
  gh api /repos/softistx/nxgt-core/actions/permissions/workflow
  # {"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}
  ```

  and set it with `gh api -X PUT` on the same path, sending
  `default_workflow_permissions=write` and `can_approve_pull_request_reviews=true`.

Until the second one is on, the release is: merge to `develop`, let the
workflow push the branch, then open the PR yourself from
`changeset-release/develop` into `develop`. Everything after that — publishing,
the tags — is automatic. CI skips the changeset check on that branch, since it
is the branch that consumes them.

### `bun publish`, not `changeset publish`

`changeset version` does the versioning and the changelogs — pure bookkeeping,
it touches no registry, and it stays. But `changeset publish` shells out to
**npm**, which would publish with a different package manager than the one
everything here is built and verified against.

So `scripts/publish.ts` does it: dependency order, skips any version already on
the registry, and `bun publish` for the rest. It prints `New tag: <name>@<v>`
for each publish, which is the line `changesets/action` parses to create GitHub
releases — do not change that format without checking it.

### Why npmjs and not GitHub Packages

Asked and settled; do not reopen it without a new fact. GitHub Packages
requires the npm scope to equal the repository owner's login, and `@nxgt` is
unreachable there — the `nxgt` GitHub org has existed since 2017 and is not
ours. Publishing under `@softistx` was tried, and abandoned for the reason that
actually decides it: **GitHub Packages demands a token to install, even for a
public package.** That is a secret in every CI job and every Docker build in
both monorepos, forever, on the same path where `scripts/build-base.sh` already
leaked one through `--build-arg`.

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

### `typescript` is a peer, pinned to 6, and it is load-bearing

All twelve declare `typescript: ^6.0.3`. Two arrived from `nxgt-federation` on
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
- **`bun run verify:artifacts`** — packs the twelve, installs them the way a
  consumer does, imports every subpath each package declares, and rejects a
  manifest that would break an install — a `link:` or `file:` in a field a
  consumer resolves, or a **required** peer that is on no registry. It reads
  the subpath list from each
  `exports` map, so a new entry point is covered as soon as it is declared.
  `changeset:publish` runs it too, so a broken artifact cannot be published.

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

Converging each pair onto one implementation is real work with real decisions
in it. It is not a tidy-up, and it is not this repository's to do unasked.

## Conventions

Inherited from both monorepos and unchanged:

- **Mongoose is imported from `@nxgt/shared-mongo`**, never directly from
  `mongoose`, in every package above it in the layering. `shared` is the one
  exception: it declares `mongoose` directly and is the layer `shared-mongo`
  builds on.
- Biome for formatting and linting: tabs, single quotes. `bun biome check
  --write` before committing.
- Commit messages: `<type>: <Capitalized summary>`, types `feat`, `fix`,
  `update`, `chore`, `docs`, `typo`.

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
  read by people who will never open this repository: say what the package is,
  table its subpaths, and write down what will bite a consumer. Ten of the
  twelve shipped `bun init` boilerplate until 2026-09-06, five of those under
  the wrong package name.

## Known state

`bun run test` is **199 pass, 0 fail**. Treat any failure as yours.

That is `bun run --filter '*' test` — **one process per package**, not one
`bun test` for the whole workspace. Running them together produced 6 failures
and 3 errors, and not one of them belonged to the test that reported it:

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

CI starts a single-node MongoDB **replica set** (the migration suite asserts on
transactions) and passes `MONGODB_URI` in the environment, which beats
`--env-file`. There is no S3 in CI, so those suites report as skipped there.
