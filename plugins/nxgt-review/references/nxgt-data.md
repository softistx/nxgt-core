# `code-reviewer` in nxgt-data

nxgt-data is the Bun workspace behind the public `@nxgt/*` data-access packages: `@nxgt/drizzle` (with the `./pg` dialect subpath), `@nxgt/meilisearch`, `@nxgt/mongo` (with the `./migrations` subpath) and the bridge `@nxgt/mongo-meilisearch`, published to npmjs with changesets. Its promise is type safety that is **measured** — what the compiler rejects, proved by `@ts-expect-error` cases — and specs that run against real servers. The worst defects here compile and pass: a refusal the types no longer make, a factory that grew a closure back, a stamp name spelled out as a literal, two copies of a driver class.

## Measure

```bash
find packages/*/src scripts -name '*.ts' ! -name '*.spec.ts' -exec wc -l {} + | sort -rn | head -20
git ls-files 'packages/*/src/**/*.spec.ts' | xargs wc -l | sort -rn | head -15
```

The green bar, as CI runs it (build first, because `exports` points at `dist/`):

```bash
./node_modules/.bin/biome ci
bun run build
bun run typecheck          # includes every package's test/types/
bun run test               # known state in AGENTS.md
bun run verify:artifacts
bun run changeset:status   # skipped on changeset-release/develop
```

You may run the measure commands, `biome ci`, `build`, `typecheck` and `verify:artifacts`. Run the suites **one package at a time** (`(cd packages/<name> && bun test)`, then `bun test scripts`), never all at once: each starts a real server (mongod, Meilisearch, PGlite), and in parallel on a short machine they fail together in ways that look like regressions — `AGENTS.md` describes them. The first run downloads mongod into `.cache/mongodb` and Meilisearch into `.cache/meilisearch`; that is expected. Never run `changeset:publish`, `scripts/publish.ts` or `bun changeset`.

## Invariants

- **Every package is standalone.** No package depends on a sibling unless it declares it by `workspace:^` and imports it by its published name; no tsconfig `paths` to a sibling, no relative import into one, and **no cycle, devDependencies included**. Only `@nxgt/mongo-meilisearch` depends on siblings, both as required peers; an import of one sibling from `@nxgt/mongo` or `@nxgt/meilisearch` is a finding — a bridge is a third package.
  `grep -n '"@nxgt/' packages/*/package.json; grep -rn "from '\.\./\.\./\.\./" packages/*/src`
- **`@nxgt/mongo/migrations` is a subpath, not a package.** `src/migrations/` imports the rest of `@nxgt/mongo`; nothing else imports it.
- **A dialect is a subpath, not a package.** What is dialect-free (errors, cursor, page shapes) lives in `@nxgt/drizzle` itself, and every dialect throws those same classes.
- **One driver, one `ObjectId`.** The `mongodb` devDependency pin stays inside the range `mongodb-memory-server-core` depends on; a tree with two drivers is a finding.
  `ls node_modules/.bun | grep '^mongodb@'`
- **Peers and pins move together.** `drizzle-orm`, `meilisearch`, `mongodb` and `zod` are peers with the ranges `AGENTS.md` gives, and exact devDependency pins inside them. A peer raised without its pin, or the reverse, is a finding.
- **A library never bundles its dependencies.** `build.ts` keeps `packages: 'external'` and `splitting: true`.
- **`export * from '<external package>'` only in an entry point**, and every entry in `nxgt.entrypoints` has a matching `exports` key, and the reverse.
  `grep -rn "export \* from '[^.]" packages/*/src`
- **A public method that refuses something has a `@ts-expect-error` case** in its package's `test/types/`. A *missing* case is the risk: a stale one already fails `typecheck`. Where a refusal is runtime-only, the README must say so.
- **`@nxgt/mongo`: nothing spells a stamp's name.** Every behaviour reads field names from `ctx.stamps` / `definition.stamps` (and, in types, from `StampNameOf` / `StampNamesOf`). A literal `'deletedAt'`, `'version'`, `'createdBy'`… used as a **field name** — a document key, a filter, an update path — is a finding, because a renamed stamp would then be a lie. The grep also finds the legitimate uses; report only the field-name ones. Legitimate: the *kind* passed to `StampNameOf<Def, 'updatedAt'>` or `IfStamp<Def, 'deletedAt', …>`, the defaults in `STAMP_FIELDS`, comments and specs.
  `grep -rnE "'(createdAt|updatedAt|deletedAt|version|createdBy|updatedBy|deletedBy)'" packages/mongo/src --include=*.ts | grep -v spec`
- **`@nxgt/mongo`: the context holds data, not closures.** A function-valued field on `CollectionContext` other than the caller's own hooks is a finding, and so is a `createContext` that returns helpers.
- **`@nxgt/mongo`: subjects import one way.** In `src/collection/`, `operations/` never imports `hooks/`; only `get-collection.ts` and `types.ts` reach into every subject; the one root import of a subject is `context.ts` → `hooks/sets`.
  `grep -rn "from '\.\./hooks" packages/mongo/src/collection/operations`
- **A refactor leaves the specs alone.** A spec that changed in a `chore:` commit means behaviour moved. A refactor is its own PR, with a patch changeset, and identical test counts on both sides.
- **A package keeps its own errors**, and depends on no exception package. The bridge throws `SearchSyncError`, wrapping its siblings' errors as `cause`.
- **`@nxgt/mongo-meilisearch`: the context holds data**, plus the caller's `transform` and `toIndexId` as given; the one widening from the caller's types is in `create-search-sync.ts`. An `as never` elsewhere is a finding.
- **`@nxgt/mongo-meilisearch`: nothing is recorded that was not sent.** A resume point is saved only after the batch it covers is applied, or, with nothing to send and no change being handled, from the subscription's `position`. A `saveState` that could run before its `send`, or while a change is in its handler, is a finding: the change would never be sent again.

## Structure

- A function over **80** lines, or a source file over **250**. A long file of declarations is not a finding (`mongo/src/collection/types.ts` is one). For a grown factory, the seam is the shape `packages/mongo/src/collection/` follows: a data-only `context.ts`, then plain functions taking it first — `filters.ts`, `documents.ts`, `operations/reads.ts`, `operations/writes.ts`, `operations/paginate.ts`.
- A folder past a dozen source files, or files that need a prefix to tell apart, is several subjects.
- Specs are split by subject and live next to the code; `AGENTS.md` lists `@nxgt/mongo`'s. A new subject with no spec of its own is a finding.
- An import carrying a `.js` or `.ts` extension is a finding.

## Deliberate — do not report

From the table in `AGENTS.md`:

- `LICENSE` at the root and in each `packages/*/`.
- `build.ts`, `scripts/`, `.github/`, `biome.json`, `bunfig.toml`, copied from nxgt-http.
- `test/mongo.ts` and `test/meilisearch.ts` in `@nxgt/mongo-meilisearch`, copies of its siblings' `test/server.ts`. Do report a `MONGOD_VERSION` that differs between the two mongo copies.
- `pagination/page.ts` and `pagination/cursor.ts` in both `@nxgt/drizzle` and `@nxgt/mongo`. Do report a fix made in one and not the other. `errors/data-error.ts` is **not** a copy: the classes differ.
- `@nxgt/drizzle`'s `pg/repository/` still being a factory: it is split when next opened for a real change, never in the same PR as a behaviour change.
- `syncIndex`'s `TASK_FAILED` and `index_already_exists` branches covered by a scripted client: Meilisearch cannot be made to fail a settings task.

## Layering and packaging

- Three standalone packages and one bridge on two of them; `@nxgt/drizzle/pg` and `@nxgt/mongo/migrations` are subpaths.
- Changesets, independent versions, `bun publish` through `scripts/publish.ts`; registry configuration in `bunfig.toml`, never `.npmrc`.
- Every package public (never `private: true`), MIT, with its own `LICENSE`; `typescript` is `^6.0.3` everywhere; siblings by `workspace:^`.
- A README is the npm page: sections with an example each, an **API**, a **What does not compile** list where the package has one, and a **Traps** section; no private name.
- Commit types: `feat`, `fix`, `update`, `chore`, `docs`, `typo`.
