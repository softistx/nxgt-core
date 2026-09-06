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
3. **`bun run typecheck && bun test && bun run build`.**
4. **`bun run verify:artifacts`.** Not optional, and not covered by the build —
   see below.
5. **PR into `develop`.** CI runs all of the above plus `changeset status`.
6. **Merge.** A "Version packages" PR opens by itself. Merging *that* publishes.
7. **Only then**, bump the dependency in the consumer and open its PR.

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
- **`typescript` stays `^6.0.3` across all twelve.** Raising it in one package
  makes the set unsatisfiable and breaks `@nxgt/shared-openapi` at import.
- **Registry config lives in `bunfig.toml`, never a `.npmrc`.** A committed
  `.npmrc` expands `${NPM_TOKEN}` to an empty string wherever the variable is
  unset, sends it as an `Authorization` header, and gets a 401 — defeating
  `npm login` inside the repo only. `bunfig` omits the credential instead, and
  public installs keep working.
- **Publishing needs a *granular* access token, scoped to `@nxgt`.** npm rejects
  classic tokens for publishing even when the account has no 2FA, with a message
  about 2FA that reads like an account problem — and a classic token still
  passes `whoami`, so it looks valid. When creating the granular one, select the
  **scope**, not packages: on a first release none exist to select, so the token
  is issued covering nothing and publishing fails with a `404 … does not exist
  in this registry` that reads like a missing package.
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
