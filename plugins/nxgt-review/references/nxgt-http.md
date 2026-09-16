# `code-reviewer` in nxgt-http

nxgt-http is the Bun workspace behind the public `@nxgt/*` HTTP packages. They are `httpyz`, `openapi-codegen`, `openapi-hono`, `openapi-httpyz`, `httpyz-query`, `datasource-rest`, `openapi-msw` and `openapi-nuxt`, all published to npm with changesets. The client is standalone first: a feature lands in `@nxgt/httpyz` before any OpenAPI binding. Most defects here would not show in a diff and would still pass the tests: a build that bundles a sibling, a dependency cycle, a manifest that breaks installs, and generated code that fails under an app's strict tsconfig.

## Measure

List the source files by size, largest first (specs excluded, then specs only):

```bash
git ls-files 'packages/*/src/**/*.ts' ':!:**/*.spec.ts' | xargs wc -l | sort -rn | head -30
git ls-files 'packages/*/src/**/*.spec.ts' | xargs wc -l | sort -rn | head -15
git ls-files 'scripts/*.ts' build.ts | xargs wc -l | sort -rn
```

The green bar, in the order CI runs it (`.github/workflows/ci.yml`). Build comes first because `exports` points at `dist/`:

```bash
./node_modules/.bin/biome ci
bun run build
bun run typecheck          # ends with typecheck:generated (tsconfig.generated.json)
bun run test               # known state in AGENTS.md
bun run verify:artifacts   # packs, installs, imports every subpath, runs every bin --help
bun run changeset:status   # skipped on changeset-release/develop
```

The reviewer may run the measure commands, `biome ci`, `build`, `typecheck`, `test` and `verify:artifacts`, because they write only to `dist/` and to generated fixtures. The reviewer must never run `changeset:publish`, `scripts/publish.ts` or `bun changeset`. Any test failure counts as a finding. It is not "pre-existing".

## Invariants

- **No dependency cycles, devDependencies included.** A package that depends on a sibling that depends back on it is a finding: the version bump has no fixed point, and changesets cannot order the release. Compare every `@nxgt/*` entry in `packages/*/package.json` with the graph under "Layering" in `AGENTS.md`. A test that needs the other end moves to the package above.
  `grep -n '"@nxgt/' packages/*/package.json`
- **A library never bundles its dependencies.** The root `build.ts` must keep `packages: 'external'` in `Bun.build`. Report anything that inlines a sibling or a third-party package. For example, openapi-httpyz bundling httpyz would give an app two `ValidationError` classes.
- **`export * from '<external package>'` appears only in an entry point.** Below one, Bun emits a re-export of an undeclared variable, and the built file throws at import while `build` still exits 0. A star re-export in any file that `nxgt.entrypoints` does not list is a finding.
  `grep -rn "export \* from '[^.]" packages/*/src`
- **Every entry point has a matching key in `exports`.** A new file under `nxgt.entrypoints` with no `exports` key, or the reverse, is a finding. A build that exits 0 does not prove the artifact loads; `verify:artifacts` does.
- **Siblings are declared with `workspace:^`, never `workspace:*`, and imported by their published name.** A `workspace:*` publishes an exact pin, so the consumer ends up with two copies. A relative import into another package, or a new tsconfig `paths` entry to a sibling, is also a finding. The only allowed `paths` entry is openapi-hono's own name, in `packages/openapi-hono/tsconfig.json`.
  `grep -rn 'workspace:\*' packages/*/package.json; grep -rn "from '\.\./\.\./\.\./" packages/*/src`
- **A consumer-resolved manifest field never holds `link:` or `file:`, and a required peer never names a package that is on no registry.** Either one breaks an install.
- **Package metadata is fixed.** Every package keeps `"license": "MIT"`, lists `LICENSE` in `files`, and has a copy of the root `LICENSE` in its own directory. `typescript` is a peer at `^6.0.3` in every package, and raising it in one package alone is a finding. `private: true` is always a finding, even for an unfinished package.
- **Peer shapes are fixed. Report any drift.**
  - `openapi-msw` must not depend on `@nxgt/openapi-hono`, because that pulls in Hono.
  - `openapi-nuxt` must not depend on `openapi-hono`. Its only `dependencies` are `@nuxt/kit`, `@nuxt/schema` and `h3`.
  - `httpyz-query` imports only types from `@tanstack/query-core`. A runtime import is a finding.
  - `datasource-rest` depends on no exception package, because `DataSourceError` is its own.
  - `openapi-codegen` depends on no sibling.
- **Generated code compiles under the strictest settings.** It lands in an app's own source, and `typecheck:generated` checks it against `tsconfig.generated.json` and the built packages. A fixture excluded to make typecheck pass counts as a generator bug, and the exclusion is the finding. Specs must call the generated code, never a hand-written copy of it.
- **Imports carry no extension.** An import ending in `.js`/`.ts` in `src`, specs or README examples is a finding. So is a generator change that makes `importExtension` default to anything other than `''`.
  `grep -rnE "from '\.{1,2}/[^']+\.(js|ts)'" packages/*/src`
- **Every change under `packages/` has a changeset in `.changeset/`.** A package diff with no changeset is a finding, except on `changeset-release/develop`.
- **An asset ships only if it lives outside `dist` and is listed in `files`.** The codegen `docs/` are shipped this way. A new runtime asset that is missing from `files` is a finding.

## Deliberate — do not report

Each of these copies must be changed together with its twin. Report a change to one copy that is not made to the other.

- **`unroutable`**: in `packages/openapi-hono/src/routable.ts` and `packages/openapi-codegen/src/emit/routable.ts`. The runtime refuses the route and the generator warns. Importing one from the other would make the runtime a dependency of the generator.
- **`LICENSE`**: at the root and in every `packages/*/`. npm ships only the package's own copy.
- **How a request is read and refused**: in `packages/openapi-hono/src/engine.ts` and `packages/openapi-msw/src/request/read-request.ts`. The mock must return the server's 400, with the same issues in the same order, without depending on Hono.
- **`packages/openapi-codegen/test/fixtures/shared-components/`**: a copy of nxgt-core's `@nxgt/shared-openapi` components. It is a fixture, not a dependency.
- **The openapi-hono tsconfig `paths` entry for its own name**: it exists so that generated `hono.ts` fixtures run the engine from `src`.
- **The generator's fixtures' `hono.ts`**: excluded from openapi-codegen's own typecheck, because openapi-hono type-checks and runs them.

## Layering and packaging

- **Layers:** `httpyz` is the base, with `openapi-httpyz` and `httpyz-query` on it. `datasource-rest`, `openapi-msw` and `openapi-nuxt` sit on `openapi-httpyz`. `openapi-codegen` stands alone, with `openapi-hono` under it as a dev-only fixture consumer. Siblings are peers plus devDependencies to build against. The generator is only ever a devDependency, for fixtures.
- **Optional peers:** `httpyz-query`'s `./openapi` subpath has `@nxgt/openapi-httpyz` as an optional peer, for types only. For `openapi-nuxt`, `hono` is an optional peer for `./hono`, and `@nxgt/httpyz-query`, `@tanstack/vue-query` and `vue` are optional peers for `./query`.
- **Build:** the root `build.ts` builds each package with `Bun.build` for JS and `tsc --emitDeclarationOnly` against `tsconfig.build.json`, which excludes `*.spec.ts`.
- **Releases:** changesets with independent versions. Merging to `develop` opens the "Version packages" PR, and merging that PR publishes. Publishing goes through `bun publish` via `scripts/publish.ts`, in dependency order, skipping versions already published. It never uses `changeset publish`. `changeset:publish` runs `verify:artifacts` first.
- **Registry and tokens:** registry configuration lives in `bunfig.toml` only. A new `.npmrc` is a finding. Installing needs no token. Publishing needs a granular `NPM_TOKEN` scoped to `@nxgt`.
- **Import rule:** the `Types`/`ObjectId`-from-`@nxgt/shared-mongo` rule is not stated here, because no package in this repo depends on Mongo.
- **Conventions:**
  - Biome, with tabs and single quotes.
  - Commits follow `<type>: <Capitalized summary>`, with `feat|fix|update|chore|docs|typo`.
  - Repo scripts are TypeScript run by Bun Shell, never `.sh`.
  - Specs sit next to the code they test, in folders by role (`client/`, `request/`, `reply/`, `middleware/`).
  - A package `README.md` is its npm page: organized by section, with a copy-paste example each, and it never names a private application.
- **Node:** `openapi-nuxt` builds `test/app` with `nuxi` under Node 22, and its `typecheck` runs `nuxi prepare` first.
