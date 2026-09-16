# `code-reviewer` in nxgt-core

nxgt-core is the Bun workspace behind the shared `@nxgt/*` packages that
`sellix-monorepo` and `nxgt-federation` install from npmjs, and it is the
marketplace for the nxgt plugins under `plugins/`. It is upstream of every
other repository: a defect here reaches consumers only after a release, and
the build proves almost nothing about the artifact they install, because
inside the workspace `@nxgt/*` resolves to `src/`.

## Measure

```bash
git ls-files 'packages/*/src/**/*.ts' ':!:**/*.spec.ts' ':!:**/*.d.ts' | xargs wc -l | sort -rn | head -30
git ls-files 'packages/*/src/**/*.spec.ts' | xargs wc -l | sort -rn | head -15
git ls-files 'scripts/*.ts' build.ts | xargs wc -l | sort -rn
```

The green bar, in this order — the build first, because every `exports` map
points at `dist/` and an unbuilt tree reports a wall of `TS2307`:

```bash
bun run build
bun run typecheck
bun run test               # one process per package; known state in AGENTS.md
bun run verify:artifacts   # packs, installs as a consumer, imports every subpath
bun run changeset:status
bunx biome ci
```

You may run all of them. `bun run test` needs the local MongoDB replica set
for `shared-mongo`; the S3 suites skip themselves without `S3_*`, which is
not a failure. **Never** run `changeset:publish`, `scripts/publish.ts`,
`bun publish` or `bun changeset`.

## Invariants

- **No cycles in the layering.** Compare every `@nxgt/*` entry in
  `packages/*/package.json` with the diagram in `AGENTS.md`. A lower layer
  depending on a higher one, or "just re-exporting" something to avoid it,
  is a finding.
  `grep -n '"@nxgt/' packages/*/package.json`
- **`export * from '<external package>'` only in an entry point.** Every hit
  must be a file in that package's `nxgt.entrypoints`; anywhere else the
  built file throws at import while the build exits 0.
  `grep -rn --include='*.ts' "^export \* from '[^.]" packages/*/src/`
- **A subpath is three edits.** The file, an `exports` key, and a line in
  `nxgt.entrypoints`. A diff touching one or two of them is a finding.
- **A library never bundles its dependencies.** `build.ts` keeps
  `packages: 'external'`. Above all `mongoose`: a second copy means models
  registered against one connection and looked up on another.
- **Declarations are part of the artifact.** An exported function whose
  inferred return type lives in a nested `node_modules` path (TS2883) needs
  an explicit annotation through a type the consumer can resolve. A
  hand-written `.d.ts` next to a `.ts` of the same basename is a finding —
  `build.ts` refuses it, but say it before the build does.
- **Siblings by `workspace:^`, never `workspace:*`.** An exact pin gave
  consumers two `shared-mongo` copies and `OverwriteModelError`.
  `grep -n 'workspace:\*' packages/*/package.json`
- **No required peer that is on no registry.** `@nxgt/material` and
  `@nxgt/map` may only ever be optional peers, or absent. A peer with no
  `peerDependenciesMeta` entry is required.
- **`typescript` is `^6.0.3` in every package.** Raising it in one makes the
  set unsatisfiable, and `@nxgt/shared-openapi` throws at import under 7.
- **An asset ships only from its own directory named in `files`.** A
  `.graphqls`, YAML or font read at runtime from `src/` is absent from the
  tarball. A path to it resolves against the package root
  (`SHARED_SCHEMA_PATH`), never a fixed relative depth.
- **A published schema is a promise the runtime keeps.** A field added to a
  shared OpenAPI or GraphQL schema with no code consuming it in the same
  change is a finding — `sort` on `SearchRequest` was documented and
  discarded by twenty-three endpoints.
- **Every package is MIT, public, and ships its own `LICENSE`.** No
  `private: true`, ever. A new package copies the root `LICENSE` and names it
  in `files`.
- **Mongoose comes from `@nxgt/shared-mongo`** in every package above it.
  Inside `shared-mongo` itself, mongoose's types come from `'mongoose'`
  directly, so the star re-export stays at the entry point; `shared` declares
  `mongoose` directly and is the one other exception.
- **No `.npmrc`, ever.** Registry configuration lives in `bunfig.toml`.
- **An optional peer is imported only on the path that uses it**, so the rest
  of the package loads without it.
- **CI runs on GitHub-hosted runners.** `runs-on: self-hosted` copied in from
  a private sibling is a finding.

## Plugins

A change under `plugins/` is reviewed too:

- A skill or agent that restates another one instead of pointing at it.
- A plugin whose content changed with no `version` bump in its
  `.claude-plugin/plugin.json`; a new plugin missing from
  `.claude-plugin/marketplace.json`.
- A private application name is fine here (this is agent guidance, not an
  npm page), but a secret, a token, a local absolute path or a production
  host is not.
- The `CLAUDE.md` plugin table out of step with `plugins/`.

## Deliberate — do not report

From the table in `AGENTS.md`:

- `paginate` (offset) and `paginateCursor` (Relay).
- `Principal` and `TokenPrincipal`.
- The REST filter helpers and the GraphQL filter DSL.
- `objectIdFromString` and `toObjectId`.
- `LICENSE` at the root and in every `packages/*/`.
- `stx-sdk` as a peer of `shared-hono` and `shared-graphql`, and a root
  devDependency.
- `verify:artifacts` reporting the `stx-sdk` subpaths as skipped on a hosted
  runner.

## Layering and packaging

- Layers: the table in `AGENTS.md`. The manifests are the source of truth;
  check `grep -n '"@nxgt/' packages/*/package.json` before reporting a
  layering finding, and report the table if it has drifted from them.
- Changesets, independent versions. `develop` opens the "Version packages"
  PR; merging it publishes through `scripts/publish.ts` and `bun publish`,
  never `changeset publish` or `npm publish`.
- A fix here is a release before it is a consumer PR. A consumer PR opened
  before the version answers on `registry.npmjs.org` is not reviewable.
- `CHANGELOG.md` is generated; a hand edit is a finding.
- Commit types: `feat`, `fix`, `update`, `chore`, `docs`, `typo`.
