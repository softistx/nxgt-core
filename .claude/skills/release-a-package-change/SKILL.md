# Skill: Release a package change

## Purpose

Every change to a package in `nxgt-core` has to travel: change here → release →
bump in `sellix-monorepo` and `nxgt-federation`. This skill is that sequence,
and the checks that stop each of its known failure modes.

## When to use

- Any edit under `packages/` — a one-line fix included.
- Any consumer PR that depends on a change made here.
- Adding a subpath, an entry point, or a dependency to a package.

Not for edits to `AGENTS.md`, `README.md`, the workflows or `scripts/`: those
release nothing, and `changeset status` will not ask for anything.

## The sequence

1. **Change the package.** Add the test in the same commit — nothing here is
   covered by a consumer's suite, and six of the packages had no test at all
   before the extraction.
2. **`bun changeset`.** Pick the packages, pick the bump, write the entry for
   the person who will read the changelog and not the diff. `patch` for a fix,
   `minor` for anything additive, `major` for a removal or a changed signature —
   remembering that both monorepos pin with `^`, so a `major` is a manual bump
   in every consumer.
   If the change genuinely releases nothing, `bun changeset --empty` and say why.
   **Commit the changeset file.** `changeset status --since=origin/develop`, the
   check CI runs, reads changesets through git and does not see an untracked
   one — it will report "no changesets were found" while the file is sitting
   right there.
3. **`bun run build && bun run typecheck && bun run test`** — in that order:
   `exports` points at `dist/`, so an unbuilt tree fails the other two for
   reasons that are not yours. `bun run test` runs one process per package;
   never `bun test` from the root, which makes packages break each other.
4. **`bun run verify:artifacts`.** Not optional, and not covered by the build —
   see below.
5. **PR into `develop`.** CI runs all of the above plus `changeset status`.
6. **Merge.** The release workflow versions the packages, pushes
   `changeset-release/develop` and opens the "Version packages" pull request
   itself. Merging *that* publishes, tags and stops. If it fails with *GitHub
   Actions is not permitted to create or approve pull requests*, a workflow
   permission has been turned back off — `gh api
   /repos/softistx/nxgt-core/actions/permissions/workflow` should answer
   `write` and `true`. Open the PR by hand meanwhile; nothing else about the
   release changes.
7. **Only then**, bump the dependency in the consumer and open its PR.

## What a changeset has to say

The changeset becomes the changelog entry, and the changelog is read by the two
people bumping a range in a monorepo six weeks from now. They have the diff
already. What they do not have is **why the old behaviour was wrong and what
they will see change.**

Shape — a one-line summary, then the defect, then the fix:

```markdown
---
'@nxgt/shared-mongo': minor
---

Let a service say which principal shape it is given.

`MongoCrudService` hard-coded `Principal`, the caller as the gateway's
`X-User-*` headers describe them. federation's services are handed
`TokenPrincipal` and read `uid` and `sub` off it — fields `Principal` does not
have. Both shapes were kept side by side on purpose; the constructor quietly
picked one.

It now takes a fourth type parameter, defaulting to `Principal` so nothing that
compiles today changes.
```

Rules, in order of how often they are broken:

- **Name the observable symptom.** "52 failing specs in nxgt-federation", "the
  first consumer to install it died on `Unknown type: \"Void\"`". A changelog
  entry that only describes the fix cannot be matched against the bug someone
  is currently looking at.
- **Say what a consumer must do,** if anything. "Nothing that compiles today
  changes" is worth writing. So is "every subclass that reads `uid` must now
  say `TokenPrincipal`."
- **One changeset per change, not per package.** A changeset lists every package
  it bumps; two changesets for one change give the changelog two half-stories.
  Cascading bumps into dependents are added by `changeset version` — do not
  list them yourself.
- **Present tense, imperative summary,** matching the commit convention:
  "Ship the shared GraphQL SDL in the package", not "Shipped" or "Fix for SDL".
- **No issue numbers, no `@user`, no "as discussed".** The changelog outlives
  all three.
- **Bump honestly.** `patch` for a fix, `minor` for anything additive, `major`
  for a removal or a changed signature. Both monorepos pin with `^`, so a
  `major` is a manual bump in every consumer and a `minor` arrives on the next
  `bun update` — which means an accidental behaviour change published as a
  `patch` reaches production without anybody deciding to take it.

## The documentation that ships with the change

A release moves three kinds of documentation, and which ones depends on what
the change is:

| Change | Also update |
| --- | --- |
| any new or changed public API | the package's **`README.md`** — it is the package's page on npmjs, read by people who will never see this repository |
| a trap that cost you more than an hour | **`AGENTS.md`**, in the same PR, in the section that owns it |
| something that changes how a *consumer* works | the consuming repo's `AGENTS.md`, in the consumer PR |
| a rule a future package must follow | the relevant **skill**, not just `AGENTS.md` — a skill is what gets loaded before the work, `AGENTS.md` is what gets read after the surprise |

`CHANGELOG.md` is generated; never edit it by hand.

The README test: someone lands on the npm page knowing nothing about this
repository. Do they learn what the package is, which subpaths it has, and what
will bite them? Ten of the twelve shipped `bun init` boilerplate for a while,
five of those under the wrong package name.

## Why step 4 exists

`bun run build` exiting 0 proves very little here. Inside this workspace
`@nxgt/*` resolves to `src/`, so nothing ever loads `dist/`, and three defects
shipped past a green build:

| package | threw at import | cause |
| --- | --- | --- |
| `@nxgt/shared-mongo` | `mongoose2 is not defined` | `export *` of an external package below the entry point |
| `@nxgt/shared-hono/mcp` | `hono is not defined` | same |
| `@nxgt/shared-openapi` | `ts.factory` undefined | wrong TypeScript major resolved by a peer conflict |

`bun run verify:artifacts` packs the twelve, installs them the way a consumer
does, imports **every subpath each package declares**, and refuses a manifest
that would break an install: a `link:` or `file:` in a field a consumer
resolves, or a **required** peer that is on no registry. It derives the subpath
list from each `exports`
map, so a new entry point is covered the moment it is declared — do not maintain
a list by hand.

## The traps this repo has already paid for

All of them are in `AGENTS.md` with the detail; the short forms:

- **`export * from '<external package>'` must sit in a declared entry point.**
  Audit with `grep -rn "^export \* from '[^.]" packages/*/src/`.
- **Never require a peer that is on no registry.** Measured on Bun 1.4.0: an
  *optional* peer never fails a consumer's install whatever its range, a
  *required* one that resolves nowhere fails it with a 404, and a `link:` in
  `devDependencies` is harmless because a consumer never installs those. The
  404 on `stx-sdk` that cost a day was a required peer, not an ignored
  `optional` — `@nxgt/material` and `@nxgt/map` are on no registry, so declare
  them optional or not at all.
- **Internal dependencies are `workspace:^`, never `workspace:*`.** The latter
  publishes as an exact version, so a consumer resolving `^1.0.0` to a newer
  release ends up with two copies of the sibling — and two `model()` calls on
  one Mongoose connection throw `OverwriteModelError`. `verify-artifacts.ts`
  refuses an exact sibling pin.
- **Assets are not in `dist`.** `bun build` bundles code and nothing else, so a
  `.graphqls`, a YAML file or a font must live in its own top-level directory
  and be named in `files` — `@nxgt/shared-graphql`'s `graphql/` and
  `@nxgt/shared-openapi`'s `openapi/`. A path exported for consumers to glob
  must resolve against the **package root**: the bundle is `dist/index.js` and
  the source is `src/<dir>/<file>.ts`, so no fixed relative depth serves both
  layouts.
- **`typescript` stays `^6.0.3` across all twelve.** Raising it in one package
  makes the set unsatisfiable and breaks `@nxgt/shared-openapi` at import.
- **Registry config lives in `bunfig.toml`, never a `.npmrc`.** A committed
  `.npmrc` expands `${NPM_TOKEN}` to an empty string wherever the variable is
  unset, sends it as an `Authorization` header, and gets a 401 — defeating
  `npm login` inside the repo only. `bunfig` omits the credential instead, and
  public installs keep working.
- **Publishing needs a *granular* access token, scoped to `@nxgt`,** and no
  read-only endpoint will tell you which kind you hold — a granular token
  answers `/-/whoami` with the username just like a classic one. The only test
  for "can this token publish" is a publish; `scripts/publish.ts` skips what is
  already released, so re-running it is free. `403 … two-factor authentication`
  means the token is classic; `404 … does not exist in this registry` means it
  is granular but covers no packages — on a first release you must select the
  **scope**, since no package exists to select. And check `~/.npmrc` and
  `$NPM_TOKEN` agree, by hash, before blaming permissions.
- **Deliberate duplication** — `paginate`/`paginateOffset`,
  `Principal`/`TokenPrincipal`, the two filter DSLs,
  `objectIdFromString`/`toObjectId`. Do not converge them as a side effect of
  another change.

## Bun is the package manager, including for publishing

`bun install`, `bun run`, `bun pm pack`, **`bun publish`**. Never `npm publish`
or `yarn`: the lockfile is `bun.lock`, the workspace protocol resolution that
`bun pm pack` performs when it rewrites `workspace:*` into a version is Bun's,
and `verify:artifacts` reproduces a Bun install specifically. Mixing package
managers here produces artifacts that differ from what consumers get.

This extends to the release itself. `changeset version` stays — it only writes
versions and changelogs — but `changeset publish` shells out to npm, so
`scripts/publish.ts` replaces it: dependency order, skip anything already on the
registry, `bun publish` for the rest. `npm` is not used at all; the credential
comes from `$NPM_TOKEN` through `bunfig.toml`.

## Trying a change without releasing

`bun run build` here, then `bun link` the package inside the consumer. Undo it
afterwards — a stale link is indistinguishable from a published version until
the moment it isn't, and that moment is usually someone else's CI.

## What the consumer side looks like

Both monorepos consume `@nxgt/*` from the public npm registry with **no token
and no `.npmrc`**. So a consumer PR is only ever a version bump plus whatever
code the new version requires. If you find yourself adding registry
configuration to a consumer, something is wrong — read the "Why npmjs and not
GitHub Packages" section of `AGENTS.md` before going further.
