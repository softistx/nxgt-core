# `code-reviewer` in nxgt-janus

nxgt-janus is an embeddable, typed alternative to the Ory suite: a library the
application runs in its own process, whose persistence is a **port** the
developer may implement. A Bun workspace published to npmjs with changesets,
nine packages: `@nxgt/janus` (entry points `.` for identities,
`./permissions`, `./conformance`), the adapters `@nxgt/janus-drizzle`,
`@nxgt/janus-mongo` and `@nxgt/janus-redis`, the integrations
`@nxgt/janus-hono` and `@nxgt/janus-telemetry`, the wiring kit
`@nxgt/janus-kit` (`./drizzle`, `./mongo`), and `@nxgt/janus-webhooks` (with
its own `./conformance`) with its adapter `@nxgt/janus-webhooks-redis`. Its
audience is outside this organisation, so type safety is the selling point
and has to be **measured**. The worst defects here compile and pass: an
adapter that turns an outage into `null`, a second copy of `StoreFailure`, a
refusal the types stopped making.

## Measure

```bash
git ls-files 'packages/*/src/**/*.ts' ':!:**/*.spec.ts' | xargs wc -l | sort -rn | head -25
git ls-files 'packages/*/src/**/*.spec.ts' | xargs wc -l | sort -rn | head -15
```

Functions with the agent's brace-bounded `awk`, over the same file list.

**Known debt to split** (measured on `develop`, 2026-09-27) — each is in the
tally until it is gone, and a diff that grows one is a finding:
`janus/src/permissions/model.ts` 687 lines, `auth/types.ts` 644,
`conformance/relations.ts` 614, `conformance/cases/users.ts` 564,
`auth/port/types.ts` 538, `janus-drizzle/src/stores.ts` 527,
`conformance/cases/tokens.ts` 501, `auth/config.ts` 496,
`permissions/resolve.ts` 495, `auth/context.ts` 472,
`janus-mongo/src/stores.ts` 445; functions: the factory in
`janus/src/auth/users.ts:50` (293 lines), `startWorker` in
`janus-webhooks/src/worker/index.ts:45` (152 — a closure holding the queue
pump, the sweep, the flush and the report), `janus-drizzle/src/tables.ts:81`
(176), `janus-drizzle/src/stores.ts:64` (161), `auth/email-flows.ts:34`
(146). The split is by role into a folder of the file's name:
`permissions/model/{schema,parse,validate}.ts`,
`conformance/relations/{grant,walk,edges}.ts`, `auth/types/` by flow.

The green bar, as CI runs it:

```bash
bun run check              # biome, and useNamingConvention, which holds the casing rule
bun run changeset:private  # no changeset names a private or unknown package
bun run build
bun run typecheck          # includes every test/types/ — the type-safety measurement
bun run test               # per package, then bun test scripts
bun run verify:artifacts   # loads every subpath; one JanusError, one StoreFailure
bun run changeset:status   # skipped on changeset-release/develop
```

You may run all of it; none of it publishes. Run the suites **one package
at a time** — `(cd packages/<name> && bun test src)`. The Redis,
mongod and PostgreSQL suites start their own servers (Redis built once into
`.cache/redis`, mongod from `.cache/mongodb`, PGlite in process unless
`JANUS_POSTGRES_URL` points at a server), so no live stack is needed, but
running them in parallel races the caches.

## Invariants

- **An absence is `null`; a failure throws.** A method of a port that can
  find nothing answers `null` (or `false`, or an empty page); a refused
  connection, a timeout, a bug throws. A `catch` that returns `null`,
  `false` or `[]` in an adapter is the worst finding here: it turns an outage
  into a silent lockout. `undefined` for an absence is a finding too.
  `grep -rn "catch" packages/janus-*/src --include=*.ts | grep -v spec`
- **One `StoreFailure`: `@nxgt/janus` is a peer, never a dependency.** Every
  adapter and integration declares `@nxgt/janus` in `peerDependencies`
  (`workspace:^`), **defines no error class**, and throws and tests
  `instanceof` against the peer's. The three guard rails stay: the peer, the
  one-class-per-entry scan in `verify:artifacts`, the `instanceof` probe in
  the conformance suite. `build.ts` keeps `splitting: true`.
  `grep -n '"@nxgt/janus"' packages/*/package.json; grep -rn "class .* extends" packages/janus-*/src`
- **No `snake_case`, anywhere** — record fields, options, errors, wire
  formats. Held by Biome's `useNamingConvention`; an override or a
  suppression that widens it is a finding. Not exceptions: error codes are
  `SCREAMING_SNAKE` values, SQL identifiers in `pgTable` string arguments are
  PostgreSQL's, and `test/types/` is exempt so refused shapes can be written.
- **No import extensions.** `from './engine'`, never `'./engine.js'`, in
  sources and in emitted declarations. Resolution is bundler only; a change
  aimed at `nodenext` consumers is out of contract (it was tried and
  reverted).
  `grep -rnE "from '\.[^']*\.(js|ts)'" packages/*/src`
- **Generated code lives in a `generated/` folder** (`src/generated/<name>.ts`),
  never as a `.generated.ts` or `.gen.ts` suffix.
- **Type safety is counted.** A public method that refuses something has a
  `@ts-expect-error` case in its package's `test/types/`, and the README
  states the count ("N plausible mistakes, N refused at compile time"). A
  case added without the count, or a count that went down, is a finding. A
  refusal that also refuses the correct call is a bug: the shapes that must
  keep compiling live beside the refusals.
- **No `any` in the public surface** — `noExplicitAny` stays on, as do
  `noUncheckedIndexedAccess` and, in `packages/janus`,
  `exactOptionalPropertyTypes`.
- **Two sides, each usable alone.** `.` never loads `src/permissions/`,
  `./permissions` never loads `src/auth/`; `src/entries.spec.ts` walks the
  runtime graph. Something both need goes in a shared directory.
- **The verbs and errors of nxgt-data**: `create*` has no I/O and is
  synchronous; a wiring refusal is a bare `TypeError`, a call-time refusal a
  class with a `code`; a message reports a shape, never a value, never a URI;
  `process.emitWarning` is the only logging channel.
- **A new package starts `"private": true`, and a private package gets no
  changeset.** Removing the flag is a commit of its own, with the changeset
  that versions it. `changeset:private` enforces the second half.

## Deliberate — do not report

- **The persistence port.** `nxgt-data` forbids one; here the port is the
  product, argued in `AGENTS.md`. What stays forbidden is factoring across
  packages.
- `null` rather than `undefined`, Standard Schema rather than Zod, a
  redefined `CursorPage`/`pageLimit` and `Clock`/`fixedClock`.
- The skeleton copied from nxgt-data (the fourth copy).
- The Redis `test/server.ts` in `janus-redis`, `janus-kit` and
  `janus-webhooks-redis` — keep the Redis version equal in all three.
- The Redis script runner and reply reader in `janus-redis/src/{stores,replies}.ts`
  and `janus-webhooks-redis/src/{queue,replies}.ts`, with the differences the
  table lists (message, `count` handling, `type`/`failure`).
- `test/case.ts` in `janus-redis`, adapted in `janus-webhooks-redis`.
- The mongod helper in `janus-mongo/test/server.ts` and `janus-kit/test/mongo.ts`;
  the DDL helper in `janus-drizzle/test/db.ts` and `janus-kit/test/postgres.ts`.
- The conformance helpers (`equal`, `ok`, `rejects`, `isOurs`,
  `describeSuite`, `fromGlobals`) in `janus/src/conformance/{assert,describe}.ts`
  and `janus-webhooks/src/conformance/`; the copy's `isOurs` takes a class
  name because the bundle renames `StoreFailure` to `StoreFailure2`.

For each, **do** report a fix made to one side and not the other, and a
drift the table does not describe.

## Layering and packaging

- `@nxgt/janus` depends on nothing in the workspace. Every other package
  takes it as a required peer. Adapters reach nxgt-data's packages
  (`@nxgt/drizzle`, `@nxgt/mongo`, `@nxgt/redis`) as peers too, by range.
- `./conformance` is product surface, not a test helper: a change to a suite
  is a change to the public contract.
- A new `packages/*` needs `bun.lock` in the same branch.
- `bunfig.toml` carries the token, never `.npmrc`; every package MIT with its
  own `LICENSE`; `typescript` is `^6.0.3` everywhere.
- A README is the npm page, with **API** and **Traps** sections and the
  refusal count; the words follow `packages/janus/docs/guide/vocabulary.md`.
- Commits are `<type>(<package>): <Capitalized summary>`; the history uses
  `feat`, `fix`, `docs`, `chore`, `ci`, `refactor` and `test`.
