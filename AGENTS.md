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

### `stx-sdk` is named in no manifest here, and that is the fix

`@nxgt/shared-hono` and `@nxgt/shared-graphql` import from `stx-sdk`, which is
published to no registry. Two shapes were tried and both broke a consumer's
`bun install` with `GET https://registry.npmjs.org/stx-sdk - 404`:

- `devDependencies: {"stx-sdk": "link:stx-sdk"}` — a `link:` shipped inside a
  tarball. A dependency's devDependencies are supposed to be ignored; a `link:`
  one is not.
- `peerDependencies: {"stx-sdk": "*"}` with `peerDependenciesMeta.optional`.
  **Bun fetches the peer anyway.** This was verified against a real published
  version whose manifest carried `optional: true` and no devDependency: the
  install still 404'd. Treat `optional` as advisory in Bun, not as a guarantee.

So neither package names `stx-sdk` at all. Nothing declares it, so nothing
tries to install it. The types still resolve, because every consumer of these
two packages already has its own `link:stx-sdk`; the import resolves out of the
consumer's `node_modules`.

The workspace still has to typecheck, so the `link:stx-sdk` devDependency lives
in the **root** `package.json`, which is private and never published. Bun
resolves it through the global link registry, so it must be linked once on any
machine that builds this repo, and on the self-hosted runner:

```sh
cd ~/workspace/dev/stx-sdk && bun link
```

The rule generalises: **no published manifest may name a `link:`, in any
dependency field** — and a dependency that exists on no registry is better left
undeclared than declared optional. `@nxgt/material` and `@nxgt/map` are in the
same situation.

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
an unbuilt tree. `bun test` is in the same position: some specs load a
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

### Publishing needs a granular access token

npm no longer accepts a classic token for publishing, whatever the account's
2FA setting. The failure is explicit:

```
403 Forbidden — Two-factor authentication or granular access token with
bypass 2fa enabled is required to publish packages.
```

A classic token still authenticates for *reads* (`/-/whoami` answers), which
makes this look like a permissions problem when it is a token-type problem.
Generate a **Granular Access Token** on npmjs with read and write on the `@nxgt`
scope, and put it in `NPM_TOKEN` — in the environment locally, and in the
repository's `NPM_TOKEN` secret for CI.

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
  consumer does, imports every subpath each package declares, and rejects any
  published manifest naming a `link:`. It reads the subpath list from each
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

## Known state

`bun test` is **178 pass / 6 fail / 3 errors** on a clean tree, from the root.
The six failures are in `shared-storage` — they need a live S3/MinIO, and their
fixture path (`src/assets/images/...`) is resolved relative to the process's
working directory, so they only pass when run from inside
`packages/shared-storage`. The three errors are `MONGODB_URI is required`, and
need a live MongoDB. Both counts are identical to what `sellix-monorepo` and
`nxgt-federation` produce on `develop`. Treat any *seventh* failure as yours.
