# `code-reviewer` in nxgt-janus

nxgt-janus is an embeddable, typed alternative to the Ory suite: a library the
application runs in its own process, whose persistence is a **port** the
developer may implement. A Bun workspace published to npmjs with changesets,
eleven packages: `@nxgt/janus` (entry points `.` for identities,
`./permissions`, `./conformance`), the adapters `@nxgt/janus-drizzle`,
`@nxgt/janus-mongo` and `@nxgt/janus-redis`, the wiring kit
`@nxgt/janus-kit` (`./drizzle`, `./mongo`), the integrations
`@nxgt/janus-hono`, `@nxgt/janus-graphql` (an Envelop plugin with the user
on the context and the `@authenticated` and `@permission` directives),
`@nxgt/janus-mail` (the flows' e-mails, built with Maizzle at this
repository's build and sent through an `@nxgt/mail` transport) and
`@nxgt/janus-telemetry`, and `@nxgt/janus-webhooks` (with its own
`./conformance`) with its adapter `@nxgt/janus-webhooks-redis`. A package
given no subpath here has the one entry point `.`; the kit has no `.`. Its
audience is outside this organisation, so type safety is the selling point
and has to be **measured**. The worst defects here compile and pass: an
adapter that turns an outage into `null`, a second copy of `StoreFailure`, a
refusal the types stopped making.

## Measure

```bash
git ls-files ':(glob)packages/*/src/**/*.ts' ':(glob,exclude)packages/*/src/**/*.spec.ts' \
  | xargs wc -l | sort -rn | head -25
git ls-files ':(glob)packages/*/src/**/*.spec.ts' | xargs wc -l | sort -rn | head -15
```

Functions with the agent's brace-bounded `awk`, over the same file list (342
source files on `develop`, the `*.fixtures.ts` included), then over the
scripts, which the pathspecs above leave out:

```bash
git ls-files 'scripts/**.ts' 'packages/*/scripts/**.ts' 'packages/*/test/**.ts' build.ts \
  | xargs wc -l | sort -rn | head -15
```
 The thresholds are
the agent's: 250 lines per file, 80 per function. The `awk` does not see a
class body, and this repository has two long ones (below): check a class by
hand.

The green bar, as CI runs it (`.github/workflows/ci.yml`, job `ci`):

```bash
biome ci                   # `bun run check` locally; holds the casing rule
bun run changeset:private  # no changeset names a private or unknown package
bun run build              # before typecheck: siblings resolve through dist/
git diff --exit-code -- 'packages/*/src/generated'   # the committed generated code is current
test -z "$(git status --porcelain -- 'packages/*/src/generated')"   # and none is left uncommitted
bun run typecheck          # includes every test/types/ — the type-safety measurement
bun run test               # per package, then `bun test scripts`: the root scripts/ specs and janus-mail's
bun run verify:artifacts   # loads every subpath; one JanusError, one StoreFailure; no test code shipped
bun run changeset:status   # pull requests only, not on changeset-release/develop
```

CI also runs `janus-drizzle` over node-postgres, postgres.js and PGlite, and
a `floors` job (*Floors*) runs the suites a README floor concerns on
PostgreSQL 15, Redis 7.0 and Valkey 7.2, then the library peers' floors,
each the exact lower bound of its peer range:

- `scripts/run-on-peer-floor.ts` (its stages in `scripts/peer-floor/`:
  `plan`, `fetch`, `stage`, `forward`) points the named packages' link to a
  peer at the floor's tarball, runs a command and puts the links back —
  `@nxgt/mail` 0.1.0 under `janus-mail`, `@nxgt/mongo` 0.17.0 under
  `janus-mongo` and the kit. It never touches a `package.json` or `bun.lock`.
- `scripts/run-in-floor-project.ts` (its stages in `scripts/floor-project/`:
  `plan`, `manifest`, `copies`, `layout`) is for a floor the rest of the
  workspace also resolves, which a link would duplicate: it packs the
  package and its `workspace:` siblings into a scratch project with the
  floors, asserts one copy of each `--single` floor and that the sources and
  the packed package resolve every floor, runs the command in a copy of the
  package, and removes the project — `@nxgt/janus-graphql` on `graphql`
  16.9.0 (`--single`), `@envelop/core` 5.0.0 and `@graphql-tools/utils`
  10.0.0.

Both forward SIGINT and SIGTERM through `scripts/peer-floor/forward.ts`, and
their specs hold that everything is put back after a success, a failure and
a signal. A floor that fails there means the README is wrong; a change that
makes it green by testing a newer version is a finding, and so is a README
that states a new floor without a step in that job. A floor linked over
when the workspace resolves the same peer elsewhere (two copies of
`graphql`) belongs in `run-in-floor-project.ts` instead. Run them locally
only as `AGENTS.md` (*Tests*) shows, after `bun run build`; a link either
refuses as left by an interrupted run is fixed by `bun install`.

You may run all of it; none of it publishes. Run the suites **one package
at a time** — `(cd packages/<name> && bun run test)`, which is
`bun test src` but for `janus-mail`'s `bun test src scripts`. The Redis,
mongod and PostgreSQL suites start their own servers (Redis built once into
`.cache/redis`, mongod from `.cache/mongodb`, PGlite in process unless
`JANUS_POSTGRES_URL` points at a server), so no live stack is needed, but
running them in parallel races the caches.

## Invariants

- **An absence is `null`; a failure throws `StoreFailure`.** A method of a
  port that can find nothing answers `null` (or `false`, or an empty page); a
  refused connection, a timeout, a bug throws. A `catch` that returns `null`,
  `false` or `[]` in an adapter is the worst finding here: it turns an outage
  into a silent lockout. `undefined` for an absence is a finding too. In
  `packages/janus`, `src/auth/outage.scan.spec.ts` also reads every fixtures
  file under `src/auth/`, `src/permissions/` and `src/stores/`: no `catch`,
  no two-argument `.then`.
  `grep -rn "catch" packages/janus-*/src --include=*.ts | grep -v spec`
- **One `StoreFailure`: `@nxgt/janus` is a peer, never a dependency.** Every
  adapter and integration declares `@nxgt/janus` in `peerDependencies`
  (`workspace:^`), **defines no error class**, and throws and tests
  `instanceof` against the peer's. The three guard rails stay: the peer, the
  one-class-per-entry scan (with its peer-range checks) in
  `verify:artifacts`, the `instanceof` probe in the conformance suite.
  `build.ts` keeps `splitting: true`. `setOf()`'s mark stays a `Symbol.for`
  property, for the same reason.
  `grep -n '"@nxgt/janus"' packages/*/package.json; grep -rn "class .* extends" packages/janus-*/src`
- **No `snake_case`, anywhere** — record fields, options, errors, wire
  formats. Held by Biome's `useNamingConvention`; an override or a
  suppression that widens it is a finding. Error codes are `SCREAMING_SNAKE`
  and that is not an exception: they are data values, not identifiers. Nor
  are the mail catalogues' kebab-case keys, which are `@nxgt/mail-presets`'
  names in JSON. **SQL identifiers are `snake_case`, and that is the one
  exception** — PostgreSQL's vocabulary, only in the `pgTable` string
  arguments; the Drizzle keys and every record a store answers stay
  camelCase. `test/types/` is exempt in Biome's `overrides`, so refused
  shapes can be written.
- **No import extensions.** `from './engine'`, never `'./engine.js'`, in
  sources and in emitted declarations. Resolution is bundler only; a change
  aimed at `nodenext` consumers is out of contract (merged once as #16,
  reverted in #17).
  `grep -rnE "from '\.[^']*\.(js|ts)'" packages/*/src`
- **Generated code lives in a `generated/` folder** (`src/generated/mail.ts`,
  `src/generated/locales.ts` in `janus-mail`), never as a `.generated.ts` or
  `.gen.ts` suffix. It is committed, excluded from Biome by `!**/generated`,
  and CI diffs it after the build.
- **Type safety is counted.** A public method that refuses something has a
  `@ts-expect-error` case in its package's `test/types/`, and the README
  states the count ("N plausible mistakes, N refused at compile time"). A
  case added without the count, or a count that went down, is a finding. A
  refusal that also refuses the correct call is a bug: the shapes that must
  keep compiling live beside the refusals. A name picked from a list goes in
  a type parameter's constraint, so an editor completes it; the specs
  `src/permissions/completions.*.spec.ts` measure that.
- **No `any` in the public surface** — `noExplicitAny` stays on, as do
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. `AGENTS.md`
  names the last for `packages/janus`; every package's `tsconfig.json` sets
  it — *observed*, and a package that drops it is a question.
- **Two sides, each usable alone.** `.` never loads `src/permissions/`,
  `./permissions` never loads `src/auth/`; `src/entries.spec.ts` walks the
  runtime graph. Something both need goes in a shared directory
  (`src/stores/guard.ts`), never in one side imported by the other.
- **The verbs and errors of nxgt-data**: `create*` has no I/O and is
  synchronous; a wiring refusal is a bare `TypeError`, a call-time refusal a
  class with a `code`; a message reports a shape, never a value, names the
  call the consumer wrote, and never contains a URI; `process.emitWarning` is
  the only logging channel.
- **The one call-time `TypeError`, in `@nxgt/janus/permissions`.** An id
  `grant()` or `revoke()` cannot store — notation characters, a NUL, a lone
  surrogate — is a bare `TypeError`: a grant writes the application's own
  ids, so a bad one is its bug. The reads a request reaches, `can()` and
  `list()`, answer such an id as an absence and never throw on it. A read
  that throws on one, or a grant that answers it quietly, is a finding.
- **A new package starts `"private": true`, and a private package gets no
  changeset.** Removing the flag is a commit of its own, with the changeset
  that versions it. `changeset:private` enforces the second half. Ten of the
  eleven packages are public; `@nxgt/janus-graphql` is still private on
  `develop`, and softistx/nxgt-janus#155 removes the flag with the changeset
  that publishes it at 0.1.0. Until it lands, a changeset naming
  `janus-graphql` anywhere else is the finding.

## Structure

- A function over **80** lines, or a source file over **250**; a diff that
  grows a file over 250 splits it first, as its own PR with no spec touched,
  or puts the new code in a file of its own role.
- **A split file becomes a folder of its name, with an `index.ts`**, nothing
  left beside it and its specs inside: `auth/types/`, `auth/users/`,
  `auth/sessions/`, `janus-drizzle/src/{stores,tables,relations}/`,
  `janus-mongo/src/{stores,relations}/`, `janus-telemetry/src/flows/`,
  `janus-webhooks/src/worker/`. `permissions/model/`,
  `permissions/resolve/` and janus-graphql's `directives/permission/` were
  split without an `index.ts` and are imported by file: they are in the
  known debt below, not a new finding each pass.
  *Observed (the owner's rule for the split, and the agent's), not stated in
  `AGENTS.md`.*
- **A spec split by behaviour becomes siblings**,
  `<subject>.<behaviour>.spec.ts` beside the module it tests
  (`engine.keto.spec.ts`, `list.pagination.spec.ts`), each case keeping its
  describe path and name. What they share goes in one `<subject>.fixtures.ts`
  beside them, which **holds no test, is imported by specs only, and imports
  no other fixtures file**. A helper several subjects use goes in the
  package's `test/` instead (`packages/janus/test/rejection.ts`,
  `janus-webhooks/test/deliveries.ts`); `test/` holds cross-subject helpers
  only. A split spec's server stays one per file (`redisPerFile()`,
  `mongoPerFile()`). Both of these answer nothing:
  `grep -ln "from '[^']*\.fixtures'" $(git ls-files '*.fixtures.ts')` and
  `grep -rln "\.fixtures'" packages/*/src packages/*/test | grep -v '\.spec\.ts$'`.
- **Every `tsconfig.build.json` excludes `**/*.fixtures.ts`** beside
  `**/*.spec.ts`, so no fixture ships, and `verify:artifacts` does not count
  one as a build input. A new package without the exclude is a finding;
  `grep -L 'fixtures' packages/*/tsconfig.build.json` answers nothing.
  `verify:artifacts` measures it too: a packed tarball holding a `*.spec.*`,
  a `*.test.*`, a snapshot or a `<subject>.fixtures.*` fails as
  `<package>: the tarball ships test code: dist/x.fixtures.d.ts`. The
  pattern is `TEST_CODE` in `scripts/artifacts/tarball.ts`, the same files as
  sources are `NOT_A_BUILD_INPUT` in `scripts/artifacts/stale.ts`: a new
  kind of test file added to one and not the other is a finding — the
  pairing *observed in their doc comments, not stated in `AGENTS.md`*.
- **A fixture that ships is a plain `fixtures.ts`**, with no dotted prefix
  (`janus/src/conformance/fixtures.ts`, `conformance/relations/fixtures.ts`,
  `janus-webhooks/src/conformance/fixtures.ts`). A `*.fixtures.ts` imported
  by production code, or a shipped `fixtures.ts` given a prefix, is a
  finding.
- **`test/types/` split by behaviour becomes `test/types/<area>/`**, one file
  per behaviour and a `fixtures.ts` for what they share
  (`packages/janus/test/types/{auth,permissions,port}/`); the numbering of
  the cases runs across the folder. `test/types/refusals.ts` stays the
  top-level list.

**Known debt to split** (measured on `develop` at `e53ef7b`, 2026-09-28,
after #154, with #155 open) — each stays in the tally until it is gone, and a
diff that grows one is a finding.

- Files over 250: **none** under `packages/*/src`, `janus-graphql`,
  `janus-webhooks` and `janus-webhooks-redis` included. Closest to the line:
  `janus-redis/src/scripts.ts` 249, `janus/src/permissions/list.fixtures.ts`
  247, `janus/src/permissions/reverse.ts` 245,
  `janus-webhooks-redis/src/queue.ts` 229, `janus-redis/src/stores.ts` 228 —
  a diff that pushes one over is the finding. The second factor's steps were
  split one module per step (#139): `lifecycle.ts` is 69, and
  `janus-mail/src/options.ts` is down to 212.
- Functions over 80, by the agent's `awk`: **none**. Longest:
  `memorySessionStore` (`janus/src/auth/port/memory/sessions.ts:11`) 71,
  `sessionStore` (`janus-drizzle/src/stores/sessions.ts:8`) 68.
- Class bodies, which the `awk` does not see: `class Reverse`
  (`janus/src/permissions/reverse.ts:35`) 211 lines and `class Walk`
  (`janus/src/permissions/walk.ts:22`) 142 — each one traversal's state and
  its steps, no method over 80 (measured with TypeScript's parser).
- Folders split without an `index.ts`: `janus/src/permissions/model/`,
  `janus/src/permissions/resolve/`, and `janus-graphql/src/directives/permission/`
  (`enforce`, `model`, `path`, `validate`), whose specs
  `permission.<behaviour>.spec.ts` and `permission.fixtures.ts` sit beside
  the folder in `directives/`. Adding the `index.ts` and moving the specs in
  is a move with no spec's content touched.
- No spec under `packages/*/src` is over 250 (the longest,
  `auth/sessions/index.spec.ts` and `auth/second-factor/flows.events.spec.ts`,
  229 each).
- Outside the pathspecs: **none**. The longest files are
  `janus/test/types/refusals.ts` 236, `scripts/check-nxgt-versions.spec.ts`
  221, `janus-mail/test/types/option-refusals.ts` 204,
  `janus-graphql/test/harness.ts` 196, `scripts/publish.ts` 180 and
  `scripts/run-in-floor-project.ts` 178 (`run-on-peer-floor.ts` 141,
  `scripts/artifacts/manifest.ts` 137, `scripts/floor-project/copies.ts` 120;
  `scripts/verify-artifacts.ts` 90, `janus-mail/scripts/build-mail.ts` 171).
  The longest functions there are two fixtures near the line,
  `isolatedInstallPerCase` (`scripts/run-on-peer-floor.fixtures.ts:42`) 77
  and `workspacePerCase` (`scripts/run-in-floor-project.fixtures.ts:39`) 72,
  then `publish.ts:112`, 65.

## Deliberate — do not report

- **The persistence port.** `nxgt-data` forbids one; here the port is the
  product, argued in `AGENTS.md`. What stays forbidden is factoring across
  packages.
- `null` rather than `undefined`, Standard Schema rather than Zod, a
  redefined `CursorPage`/`pageLimit` and `Clock`/`fixedClock` (`fixedClock`
  shipped, not test-only).
- The skeleton copied from nxgt-data (the fourth copy), with
  `verify-artifacts.ts` split into `scripts/artifacts/`, as `AGENTS.md`
  declares beside the skeleton rule and in its duplication table. The split
  was made here first; nxgt-data (softistx/nxgt-data#135), nxgt-http
  (softistx/nxgt-http#53) and nxgt-core (softistx/nxgt-core#152) have since
  split theirs module for module. All four copies hold the same three
  checks: the test-code check, the `newestMtime` guard that reports an
  unbuilt package as `no dist/`, and `missingFiles`, whose spec holds that a
  `files` entry `dis` is not covered by `dist/`. The differences that remain
  are declared: `browser.ts` is nxgt-core's alone; this copy and nxgt-data
  read a sibling's version from the workspace, nxgt-http and nxgt-core from
  the packed manifests; and `check-changesets.ts`, the two floor scripts
  `run-on-peer-floor.ts` and `run-in-floor-project.ts`, and their
  `scripts/peer-floor/` and `scripts/floor-project/`, are this copy's alone.
  `check-nxgt-versions.ts`, its spec and `nxgt-versions.yml` are copied into
  nxgt-core (the script byte for byte but its header, the spec but the one
  package it expects to find, `@nxgt/ory-sdk`) and nxgt-data, which
  reads every `<folder>/*` workspace glob, `examples/*` included, exits 2 on
  any other glob (`folderOf`), and counts a private workspace's
  `dependencies` (`manifestOf`); nxgt-http has no external `@nxgt/*` to
  track. A fix to a check in one copy and not the others is still reported.
- The Redis `test/server.ts` in `janus-redis`, `janus-kit` and
  `janus-webhooks-redis` — byte-identical, and both CI jobs key their Redis
  cache on all three.
- The Redis script runner and reply reader in `janus-redis/src/{stores,replies}.ts`
  and `janus-webhooks-redis/src/{queue,replies}.ts`, with every difference
  the table in `AGENTS.md` lists — the failure's message, a `runner` with no
  `slot`, a lazy `argsOf(operation)` for an eager `args`, the two `count`
  readings, `type`/`failure` and `unreadable`. A difference it does not list
  is drift.
- `test/case.ts` in `janus-redis`, adapted in `janus-webhooks-redis`; both
  end with `redisPerFile()`.
- The mongod helper in `janus-mongo/test/server.ts` and `janus-kit/test/mongo.ts`;
  the DDL helper over `defineJanusTables()` in `janus-drizzle/test/db.ts` and
  `janus-kit/test/postgres.ts`.
- The conformance helpers (`equal`, `ok`, `rejects`, `isOurs`,
  `describeSuite`, `fromGlobals`) in `janus/src/conformance/{assert,describe}.ts`
  and `janus-webhooks/src/conformance/{assert,describe}.ts`. Both `isOurs`
  take the error's `name`, because the bundle renames `StoreFailure` to
  `StoreFailure2`, and their bodies are identical; the copy has no `isNull`.
- The integrations' reading of `janus()` and of a refusal — `Auth`,
  `UserOfAuth`, and the fields a client may read from a `JanusError`
  (`issues`, `minLength`, `attemptsLeft`) — in
  `janus-hono/src/{session,errors}.ts` (`bodyOf`) and
  `janus-graphql/src/{types,errors}.ts` (`actionable`). The status table is
  not duplicated: both answer `@nxgt/janus`'s `statusOf`, and a third copy
  of it is a finding. Never `reason`, `login` or a cause in either.
- The characters no object id may hold (`@`, `#`, parentheses) and the empty
  id, in `janus/src/permissions/input.ts` (`RESERVED`, `idOf`) and
  `janus-graphql/src/directives/permission/enforce.ts` (`UNNAMEABLE`):
  `can()` refuses such an id with a `TypeError`, `@permission` answers it
  `NOT_FOUND` before asking. One changed without the other turns an id the
  core refuses into a 500.
- `janus-mail`'s committed `src/generated/mail.ts`, whose header says to
  git-ignore it — a declared divergence; the header is the generator's.

For each, **do** report a fix made to one side and not the other, and a
drift the table does not describe.

## Layering and packaging

- `@nxgt/janus` depends on nothing in the workspace. Every other package
  takes it as a required peer. A package that wraps an nxgt library peers it
  by range, `>=<floor> <1` for a `0.x` (`@nxgt/drizzle`, `@nxgt/mongo`,
  `@nxgt/redis`, `@nxgt/mail`, `@nxgt/telemetry`), and the driver beneath it
  too; a caret on a `0.x` is a finding. The one sibling dependency is
  `@nxgt/janus-redis` inside `janus-kit`, which the application never
  imports. The sibling peers, *observed in the manifests*:
  `janus-webhooks-redis` peers `@nxgt/janus-webhooks` (required), and
  `janus-kit` peers `@nxgt/janus-drizzle`, `@nxgt/janus-mongo` and
  `@nxgt/janus-telemetry` (optional). `janus-graphql` peers no sibling but
  the core; its other peers are `graphql` (`^16.9.0 || ^17.0.0`: 17.0.2 in the
  `ci` job, 16.9.0 in *Floors*), `@envelop/core` (`^5.0.0`) and `@graphql-tools/utils`
  (`>=10.0.0 <13`), whose floors *Floors* runs. A new edge between siblings is a
  question; a sibling in `dependencies` other than the kit's `janus-redis` is
  a finding, since `AGENTS.md` forbids factoring across packages.
- `./conformance` is product surface, not a test helper: a change to a suite
  is a change to the public contract.
- **A new `UserEvent` touches `janus-webhooks` and `janus-webhooks-redis`,
  with an upgrade-order note.** Their lists of event types
  (`janus-webhooks/src/event-types.ts`, `janus-webhooks-redis/src/replies.ts`)
  are held to `UserEventType` by `satisfies Record<UserEventType, true>`, so
  a type added in `@nxgt/janus` fails their build until it is listed, as
  `user.secondFactorEnabled` and `user.secondFactorDisabled` did in #125. The
  same change lists it in both, round-trips it in the queue conformance case
  (`janus-webhooks/src/conformance/cases/queue.ts`), carries a minor
  changeset for `@nxgt/janus`, `janus-webhooks` and `janus-webhooks-redis`
  together (the peers are `workspace:^`, so their ranges move with it), and
  says in both READMEs how to upgrade: the receiver before the sender, and
  the new types held back from an endpoint until every process sharing the
  queue is upgraded. A new event type without the note, or a list widened to
  `string` to dodge the `satisfies`, is a finding — *observed in the READMEs
  and #125, not stated in `AGENTS.md`*.
- `janus-mail`'s Maizzle, Vue, Tailwind and `@nxgt/mail-*` build packages are
  devDependencies, Maizzle pinned exact and direct; no `postinstall`. What a
  build writes outside `dist/` goes beside it (`packages/janus-mail/mails/`),
  never in it.
- A change to a `package.json` lands with its `bun.lock` in the same commit
  (CI installs frozen); a lock-only bump of an `@nxgt/*` devDependency gets an
  empty changeset.
- `bunfig.toml` carries the token, never `.npmrc`. Every package MIT with
  its own `LICENSE`, and `typescript` `^6.0.3` as a peer in every package (the
  root pins `~6.0.3`) — *observed, not stated in `AGENTS.md`*.
- A README is the npm page, with the six sections *Install*, *API*,
  *Traps*, *Documentation*, *Type safety, counted*, *Licence*, and the
  refusal count; the detail lives in the package's `docs/`, and the words
  follow `packages/janus/docs/guide/vocabulary.md`.
- Commits are `<type>(<package>): <Capitalized summary>`, the scope a
  package's directory name, no scope for the repository; the types are
  `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `build` (build
  configuration: tsconfig, bundler, packaging), and `revert`, once. Pull
  requests merge with a merge commit, never squashed or rebased.
