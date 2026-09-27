# `code-reviewer` in nxgt-janus

nxgt-janus is an embeddable, typed alternative to the Ory suite: a library the
application runs in its own process, whose persistence is a **port** the
developer may implement. A Bun workspace published to npmjs with changesets,
ten packages: `@nxgt/janus` (entry points `.` for identities,
`./permissions`, `./conformance`), the adapters `@nxgt/janus-drizzle`,
`@nxgt/janus-mongo` and `@nxgt/janus-redis`, the wiring kit
`@nxgt/janus-kit` (`./drizzle`, `./mongo`), the integrations
`@nxgt/janus-hono`, `@nxgt/janus-mail` (the flows' e-mails, built with
Maizzle at this repository's build and sent through an `@nxgt/mail`
transport) and `@nxgt/janus-telemetry`, and `@nxgt/janus-webhooks` (with its
own `./conformance`) with its adapter `@nxgt/janus-webhooks-redis`. Its
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

Functions with the agent's brace-bounded `awk`, over the same file list (305
source files on `develop`, the `*.fixtures.ts` included). The thresholds are
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
bun run test               # per package, then `bun test scripts`
bun run verify:artifacts   # loads every subpath; one JanusError, one StoreFailure; no test code shipped
bun run changeset:status   # pull requests only, not on changeset-release/develop
```

CI also runs `janus-drizzle` over node-postgres, postgres.js and PGlite, and
a `floors` job runs the suites a README floor concerns on PostgreSQL 15,
Redis 7.0 and Valkey 7.2. A floor that fails there means the README is wrong;
a change that makes it green by testing a newer version is a finding.

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
  that versions it. `changeset:private` enforces the second half. All ten
  packages are public today.

## Structure

- A function over **80** lines, or a source file over **250**; a diff that
  grows a file over 250 splits it first, as its own PR with no spec touched,
  or puts the new code in a file of its own role.
- **A split file becomes a folder of its name, with an `index.ts`**, nothing
  left beside it and its specs inside: `auth/types/`, `auth/users/`,
  `auth/sessions/`, `janus-drizzle/src/{stores,tables,relations}/`,
  `janus-mongo/src/{stores,relations}/`, `janus-telemetry/src/flows/`,
  `janus-webhooks/src/worker/`. `permissions/model/` and
  `permissions/resolve/` were split without an `index.ts` and are imported
  by file: they are in the known debt below, not a new finding each pass.
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
  kind of test file added to one and not the other is a finding.
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

**Known debt to split** (measured on `develop` at `1cc6934`, 2026-09-27,
after 0.9.0) — each stays in the tally until it is gone, and a diff that
grows one is a finding.

- Files over 250: **none** under `packages/*/src`. Closest to the line:
  `janus-redis/src/scripts.ts` 249, `janus/src/permissions/list.fixtures.ts`
  247, `janus/src/permissions/reverse.ts` 245, `janus-mail/src/options.ts`
  236, `janus-mail/src/types.ts` 234, `janus/src/auth/second-factor/lifecycle.ts`
  231 (192 before the second factor's events, #125) — a diff that pushes
  one over is the finding.
- Functions over 80, by the agent's `awk`: **none**. Longest:
  `confirmChallenge` (`janus/src/auth/second-factor/challenge.ts:64`) 71,
  `memorySessionStore` (`janus/src/auth/port/memory/sessions.ts:11`) 71.
- Class bodies, which the `awk` does not see: `class Reverse`
  (`janus/src/permissions/reverse.ts:35`) 211 lines and `class Walk`
  (`janus/src/permissions/walk.ts:22`) 142 — each one traversal's state and
  its steps, no method over 80 (measured with TypeScript's parser).
- Folders split without an `index.ts`: `janus/src/permissions/model/` and
  `janus/src/permissions/resolve/`. Adding one is a move with no spec touched.
- No spec under `packages/*/src` is over 250 (the longest,
  `auth/sessions/index.spec.ts`, 229).
- Outside the pathspecs: **none**. `scripts/verify-artifacts.ts` is 90 lines
  since #124 split it into `scripts/artifacts/` (the longest,
  `manifest.ts`, 136); the longest file under `scripts/` is
  `check-nxgt-versions.spec.ts`, 221, the longest function `publish.ts:112`,
  65, and `janus-mail/scripts/build-mail.ts` is 148.

## Deliberate — do not report

- **The persistence port.** `nxgt-data` forbids one; here the port is the
  product, argued in `AGENTS.md`. What stays forbidden is factoring across
  packages.
- `null` rather than `undefined`, Standard Schema rather than Zod, a
  redefined `CursorPage`/`pageLimit` and `Clock`/`fixedClock` (`fixedClock`
  shipped, not test-only).
- The skeleton copied from nxgt-data (the fourth copy), but for
  `scripts/artifacts/`: this copy of `verify-artifacts.ts` is split there,
  a divergence `AGENTS.md` declares beside the skeleton rule and in its
  duplication table. nxgt-data's copy is still one file; the test-code check
  is the part to carry back, so a fix to a check in one copy and not the
  other is still reported.
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
  `@nxgt/janus-telemetry` (optional). A new edge between siblings is a
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
  (`janus-webhooks/src/conformance/cases/queue.ts`), moves the three peer
  ranges together, and says in both READMEs how to upgrade: the receiver
  before the sender, and the new types held back from an endpoint until every
  process sharing the queue is upgraded. A new event type without the note,
  or a list widened to `string` to dodge the `satisfies`, is a finding.
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
  configuration: tsconfig, bundler, packaging), and `revert`, once. Pull requests merge with a merge commit, never squashed or rebased.
