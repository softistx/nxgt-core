# `code-reviewer` in nxgt-di

nxgt-di is the Bun workspace behind `@nxgt/di`, a dependency-injection
container for applications, and `@nxgt/di-hono`, its Hono integration (to
come). They will be published to npmjs. Until the first-release slice, every
package is `"private": true`. `@alxia/di` lives in the alxia repository, not here.

The library's whole value is in its types. A missing dependency, a Slot left
unfilled, or a singleton that captures a scoped value must fail to compile. A
change that keeps the specs green but lets one of those compile is the worst
bug this repository can ship, and no test failure will announce it.

The vocabulary is in `CONTEXT.md`, and the decisions are in `docs/adr/`. Hold
code and docs to those terms: Token, Provider, Container, Scope, Slot, Module,
Lifetime, Bound, Override, Exposed dependency.

## Measure

```bash
find packages/*/src scripts -name '*.ts' ! -name '*.spec.ts' -exec wc -l {} + | sort -rn | head -20
```

The green bar, as CI runs it:

```bash
./node_modules/.bin/biome ci
bun run build
bun run typecheck          # packages, scripts, and test/consumer (an app-like tsconfig)
bun run test
bun run verify:artifacts
bun run changeset:status
```

You may run all of them. Never run `changeset:publish`, `scripts/publish.ts`
or `bun changeset`.

## Invariants

- **No decorators and no `reflect-metadata`, anywhere** (ADR 0001).
  `grep -rn 'reflect-metadata\|@injectable\|Symbol.metadata' packages/*/src packages/*/package.json`
- **`@nxgt/di` has no runtime dependency and no Bun-only API.** It is
  Bun-first, not Bun-only: a `Bun.*` call or a `bun:` import in
  `packages/di/src` is a finding.
- **Every compile error the API promises has a type test, with a probe.**
  Each `@ts-expect-error` in `test/types/` needs a positive case nearby
  showing that the same code compiles when it is correct. An
  `@ts-expect-error` with no probe can pass for the wrong reason. Check
  missing Token, provide order, unfilled Slot, a duplicate Token name, the
  captive check, a transient's `bound`, and `use` of a Module whose
  requirements are not met.
- **The type tests also pass under `test/consumer/tsconfig.json`.** A type
  that holds only under the repository's strict config does not hold for
  applications.
- **A Token's name is its key at compile time, and its Symbol is its identity
  at runtime** (ADR 0002). Code that looks values up by name at runtime, or
  types that key on the Symbol, mixes the two up.
- **`get` and `resolve` always return a Promise.** A sync fast path in the
  public types is a finding, even for a Slot or a cached singleton.
- **Disposal runs in reverse creation order, includes transients, and is
  idempotent.** A second dispose does nothing. A resolve after dispose
  rejects. A Scope's disposal never touches singletons. When `dispose` is
  omitted, the value's `Symbol.asyncDispose`, then its `Symbol.dispose`, is
  called.
- **A factory that fails is not cached, and concurrent resolves share one
  in-flight promise.** A memoised rejection, or two calls to one singleton
  factory under concurrency, is a finding.
- **`override` never mutates.** It returns a new Container, and the original
  resolves exactly as before.
- **The type checker stays affordable.** `test/types/stress.ts` (60
  Providers, once it exists) must not hit TS2589.
- **`@nxgt/di-hono` creates its Scope lazily and disposes of it in a
  `finally`.** A request that never touches the Scope creates nothing. A
  handler that throws still disposes. `expose` is reached only through
  `di(...)`'s return value, so it is checked against the Container.

## Structure

The default thresholds apply (250 lines per file), and AGENTS.md sets no
others. Until slice 2 lands, `packages/di/src` holds only a version constant,
so there is nothing to tally.

## Deliberate — do not report

From `AGENTS.md`:

- `tsconfig.base.json` is nxgt-data's strict one, not nxgt-telemetry's.
- `ci.yml` has no service caches and no `newest-peers` job, and does not run
  on `push` to `develop`.
- nxgt-data's `check-nxgt-versions`, `meilisearch`, `redis`, `seaweedfs` and
  `newest-peers` scripts are absent.
- `"private": true` on every package until the first-release slice. Removing
  it is a commit of its own.
- Imports without an extension. A failure only under `nodenext` is not a bug.
- The curried `token<T>()(name)`, which exists because TypeScript has no
  partial type-argument inference (ADR 0002).

## Layering and packaging

`@nxgt/di` depends on nothing. `@nxgt/di-hono` takes `@nxgt/di` and `hono` as
peers, never the other way round. `@alxia/di` belongs in the alxia
repository, and a copy of it here is a finding. Siblings depend on each other
by `workspace:^`. The shared root files are byte-for-byte copies of nxgt-data,
so run the `diff` loop from `nxgt-monorepo:lay-out-a-library-monorepo`.
