# `code-reviewer` in nxgt-data

nxgt-data is the Bun workspace behind the public `@nxgt/*` data-access packages, published to npmjs with changesets: three standalone ones — `@nxgt/drizzle` (with the `./pg` dialect subpath), `@nxgt/meilisearch` and `@nxgt/mongo` (with the `./migrations` subpath) — and three built on siblings: the bridge `@nxgt/mongo-meilisearch`, the wiring kit `@nxgt/mongo-kit`, and `@nxgt/mongo-search-kit` over both kits. `examples/` holds applications, not packages. Its promise is type safety that is **measured** — what the compiler rejects, proved by `@ts-expect-error` cases — and specs that run against real servers. The worst defects here compile and pass: a refusal the types no longer make, a factory that grew a closure back, a stamp name spelled out as a literal, two copies of a driver class.

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

You may run the measure commands, `biome ci`, `build`, `typecheck` and `verify:artifacts`. Run the suites **one package at a time** (`(cd packages/<name> && bun run test)` — the `test` script, not bare `bun test`: the ones needing Meilisearch download it first — then the examples, then `bun test scripts`), never all at once: each starts a real server (mongod, Meilisearch, PGlite), and in parallel on a short machine they fail together in ways that look like regressions — `AGENTS.md` describes them. The first run downloads mongod into `.cache/mongodb` and Meilisearch into `.cache/meilisearch`; that is expected. Never run `changeset:publish`, `scripts/publish.ts` or `bun changeset`.

## Invariants

- **A sibling is reached only as a published peer.** A package that depends on a sibling declares it by `workspace:^` in **both** `peerDependencies` and `devDependencies`, and imports it by its published name; no tsconfig `paths` to a sibling, no relative import into one, and **no cycle, devDependencies included**. The direction is fixed: `@nxgt/drizzle`, `@nxgt/meilisearch` and `@nxgt/mongo` depend on **nothing** in the workspace — an import of a sibling from one of those three is a finding. `@nxgt/mongo-meilisearch` sits on two, `@nxgt/mongo-kit` on one, `@nxgt/mongo-search-kit` on four. Anything that joins two packages is a **new package**, never a feature of either.
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
- **`@nxgt/mongo-kit`: the kit is immutable, and closes only what it opened.** `as`, `withSession` and `transaction` build a kit on a **new context**, never mutate one; the clients come from `connectMongo`, whose holds are counted per URI, and a client the application passed in is never closed.
- **`@nxgt/mongo-search-kit`: it does not own the Mongo kit.** Closing it stops the syncs and nothing else. Its config type infers `I` from each entry's **`index` alone** (`IndexMap<I>`): widening that to infer the whole entry defeats contextual typing of an inline `transform`, which then comes back `any`, and is a finding even though it compiles.
- **A promise a package owns is taken where it is created.** In Bun a rejection with no handler **ends the process**, and attaching one *later* than the rejection does not save it. A loop that starts several long-lived things and only attaches `.catch` after the loop is a finding, even when every exit path attaches one: the window is every later `await`. Measured in `@nxgt/mongo-search-kit`, where a later `start` runs a full reindex.
- **A `Promise.race` settles once, so it reports one failure.** Code that then treats "this failed" as "this was already reported" loses every failure after the first. Whatever swallows a duplicate must match the **one** the race actually carried.
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
- The test servers, copied rather than shared, because a package reaches no sibling's tests and an example reaches no package's: **five** mongod copies (`@nxgt/mongo` and `@nxgt/mongo-kit` as `test/server.ts`, `@nxgt/mongo-meilisearch` and `@nxgt/mongo-search-kit` as `test/mongo.ts`, `examples/hono-api/test/kit.ts`) and **three** Meilisearch ones (`@nxgt/meilisearch`'s `test/server.ts`, and `test/meilisearch.ts` in the two that need it). Do report a `MONGOD_VERSION` that differs between any of the five, or a fix made in one copy and not the others; CI keys its cache on the hash of all five.
- `pagination/page.ts` and `pagination/cursor.ts` in both `@nxgt/drizzle` and `@nxgt/mongo`. Do report a fix made in one and not the other. `errors/data-error.ts` is **not** a copy: the classes differ.
- `@nxgt/drizzle`'s `pg/repository/` still being a factory: it is split when next opened for a real change, never in the same PR as a behaviour change.
- `syncIndex`'s `TASK_FAILED` and `index_already_exists` branches covered by a scripted client: Meilisearch cannot be made to fail a settings task.

## Layering and packaging

- Six packages: three standalone, then a bridge on two, a kit on one, and a kit on four. `@nxgt/drizzle/pg` and `@nxgt/mongo/migrations` are subpaths, not packages.
- **`examples/` are applications, not packages**: `private`, unscoped, and invisible to `publish.ts` and `verify-artifacts.ts`, which glob `packages/*/package.json`. They are workspace members so one install covers them, and the root `typecheck` and `test` reach them. An example under `packages/`, or a `private: true` under `packages/`, is a finding. `examples/hono-api` is laid out **by module** — `src/modules/<name>/<name>.{model,service,route}.ts` — and a module **exports** its own `Hono` rather than being handed one; a file that exists only to be a layer across modules is a finding.
- **A changed package needs a changeset that names it.** `bun changeset --empty` names none, and `changeset status --since` compares changed packages to the packages changesets *name* — so an empty changeset does **not** cover a package whose files changed, however trivially. A PR that touches a sibling's `test/` for a comment either accepts a release or leaves the comment alone.
- Changesets, independent versions, `bun publish` through `scripts/publish.ts`; registry configuration in `bunfig.toml`, never `.npmrc`.
- Every package public (never `private: true`), MIT, with its own `LICENSE`; `typescript` is `^6.0.3` everywhere; siblings by `workspace:^`.
- A README is the npm page: sections with an example each, an **API**, a **What does not compile** list where the package has one, and a **Traps** section; no private name.
- Commit types: `feat`, `fix`, `update`, `chore`, `docs`, `typo`.
