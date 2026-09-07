# `large-feature-branch-workflow` in nxgt-core

This repository is upstream of the other three, so an effort here is almost
always the first half of a cross-repository one. The consumer PRs are not
slices of this effort — they are separate PRs in their own repositories,
opened after the release.

## Green

`bun run build && bun run typecheck && bun run test && bun run verify:artifacts`.

The last one is the check that matters and the one nothing else substitutes
for: `bun run build`, `typecheck` and `biome` all pass on packages whose built
output is broken, because the workspace never imports the built output —
`@nxgt/*` resolves to `src/` here. `verify:artifacts` packs each package,
installs the tarballs the way a consumer does, and imports every subpath in
`exports`. It is wired into `changeset:publish`, so a release cannot skip it.

## What counts as a contract

`exports`, `files`, and the peer ranges. A subpath that stops resolving, an
asset that stops shipping, or a peer range no published version satisfies are
all invisible to the build and fatal to a consumer.

## Sequencing

1. **The package change**, with its changeset, in its own slice.
2. **The release** — see `release-a-package-change`. It is not a slice; it is a
   Version PR that merges and publishes.
3. **The consumer PRs**, in `sellix-monorepo` and `nxgt-federation`, opened
   only once the version answers 200 on `registry.npmjs.org`.
4. **Docs and skills last.**

A single package change often has to travel to two consumers. Opening both
before the publish lands is the common way to waste a review.

## Deep review — the access surface here

Whether a slice widened what a package exports: a new subpath, a type that
leaks an internal, a `files` entry that ships more than intended, or a
dependency moved from `peerDependencies` into `dependencies` — which quietly
makes this repository responsible for a version the consumer used to choose.

Types in use here: `feat`, `fix`, `update`, `chore`, `docs`, `typo`.
