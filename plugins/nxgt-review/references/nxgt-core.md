# `code-reviewer` in nxgt-core

nxgt-core is the Bun workspace behind the shared `@nxgt/*` packages that
the two consumer repositories install from npmjs, and it is the
marketplace for the nxgt plugins under `plugins/`. It is upstream of every
other repository: a defect here reaches consumers only after a release, and
the build proves almost nothing about the artifact they install, because
inside the workspace `@nxgt/*` resolves to `src/`.

## Measure

```bash
git ls-files ':(glob)packages/*/src/**/*.ts' ':(glob,exclude)packages/*/src/**/*.spec.ts' ':(glob,exclude)packages/*/src/**/*.d.ts' | xargs wc -l | sort -rn | head -30
git ls-files ':(glob)packages/*/src/**/*.spec.ts' | xargs wc -l | sort -rn | head -15
git ls-files 'scripts/*.ts' build.ts | xargs wc -l | sort -rn
```

The green bar, in this order — the build first, because every `exports` map
points at `dist/` and an unbuilt tree reports a wall of `TS2307`:

```bash
bun run build
bun run typecheck
bun run test               # one process per package, then scripts/; known state in AGENTS.md
bun run verify:artifacts   # packs, installs as a consumer, imports every subpath
bun run changeset:status
bunx biome ci
bun run test:graphql17     # CI runs it after the artifact check; see below
```

You may run all of them. `bun run test` needs the local MongoDB replica set
for `shared-mongo`, whose `test` script reads `.env.test` (CI passes
`MONGODB_URI` in the environment, which beats it); the S3 suites skip themselves without `S3_*`, which is
not a failure. `test:graphql17` temporarily moves `graphql` to 17 in the package's
`package.json` and `bun.lock` and puts them back: run it in a worktree you
can discard, and check `git status` after. **Never** run `changeset:publish`, `scripts/publish.ts`,
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
- **`typescript` is `^6.0.3 || ^7.0.0` in every package, moved together.**
  A range changed in one package alone is a finding (`newest-peers.ts`
  fails on it). TypeScript 7 ships no compiler API, so a shipped file that
  touches `ts.*` at module scope, or types it as `typeof
  import('typescript')`, is a finding: load it when the code that needs it
  runs, as `@nxgt/shared-openapi`'s `compiler-api.ts` does. The root
  `devDependencies` and `overrides` stay `~6.0.3` until `vue-tsc` runs on 7.
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
- **A caller is never read from what the client writes alone.** Since
  `@nxgt/shared-graphql` 3.0, `useAuth()` and `extractJwtPlugin()` read the
  request's `extensions` only when a `trustedGateway` vouches for it; since
  `@nxgt/shared-hono` 4.0, `currentUser()` takes the same `trustedGateway`,
  as does `principalFromMockHeaders`. Those four throw without one — the
  plugins and `currentUser()` at construction, `principalFromMockHeaders`
  on the call. `oryAuth(ory)` needs none and is the normal call: without a
  `trustedGateway` it never reads the `X-User-*` headers, and
  `oryAuth(ory, { trustedGateway })` reads a route spec's mock headers only
  with it **and** under `NODE_ENV=test`. A default that trusts the body or
  the `X-User-*` headers, a `trustedGateway` that always answers `true`, a
  secret compared other than in constant time, or an export of
  `principalFromUserHeaders` is a finding.
- **One definition of the proof, in `@nxgt/security/gateway`.**
  `gatewaySecret`, `GATEWAY_SECRET_HEADER`, `requireGatewayTrust`,
  `assertGatewaySecret` and the `GatewayTrust` types live there; both
  packages re-export `gatewaySecret`, `GATEWAY_SECRET_HEADER` and the types.
  Each package's own `requireGatewayTrust(options, caller)` — a different
  signature on purpose, wording the error for its source — is not a
  duplicate. A second definition of the secret or of its comparison in
  `shared-graphql` or `shared-hono`, or a change to the proof made in one of
  them, is a finding.
  `grep -rn "export function gatewaySecret\|constantTimeEqual" packages/*/src --include=*.ts | grep -v spec`
  answers `packages/security/src/gateway/` only.
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
- Report any private application name, or an internal name for the set of
  applications ("the parc", "the estate"), as a finding (owner, 2026-10-11):
  this repository is public, and the wording is "the consumer monorepo" or
  "the applications that use these packages". The `nxgt-*` repository names
  are fine. A secret, a token, a local absolute path or a production
  host is a finding too.
- The `CLAUDE.md` plugin table out of step with `plugins/`.

## `nxgt-issues`

A change under `plugins/nxgt-issues/` is checked for what the plugin promises:

- **The scrub runs on the rendered text before any public filing.** `file` and
  `deps --file` render the body, title and comments, then `scrub()` the result
  and refuse on a hit; a new template or field that reaches GitHub without
  passing through it is a finding. Filings stay anonymous: no application name
  in a package issue or comment, names only in the private tracking issue.
- **No network outside `scripts/lib/runner.ts`.** No `Bun.spawn`, Bun Shell (`$` templates) or
  `fetch(` anywhere else in `lib/`, in `scripts/hooks/*.ts` or in a
  `*.fixtures.ts` (`no-network.spec.ts` enforces it; a fixture imports only
  `type Runner`); entry files alone build the real runner, and specs use the
  scripted fake. The runner leads its own process group per call and kills the
  group at the timeout or on `signal`, so even a grandchild holding the pipes
  is bounded and no `gh` outlives the hook; a call it cut is `timedOut`, which
  `gh()` raises as `GhTimeout`: in the hook's inline refresh a timeout, never a failed stamp.
- **One exit-code mapping.** A command's error goes through `exitForError`
  (`filing.ts`), with its message on stderr; `NXGT_ISSUES_DISABLE` exits 2, so
  `markers` exit 1 only ever means flagged or usage. A GraphQL answer with
  errors is never cached as a full snapshot and an unreadable alias is never
  read as "not found" (`graphql-partial.ts` is the one transport). Label names
  are lower-cased where parsed and compared through `hasLabel` and the
  `LABELS` keys, never a bare literal.
- **Text from GitHub is untrusted.** Titles, labels, comments, logins and
  bodies reach Claude's context only through `oneLine` (`untrusted.ts`: one
  line of code points, control, format, private-use, surrogate, unassigned,
  default-ignorable, Hangul filler, U+2800 and angle-bracket characters
  stripped, from the one list in `hidden-chars.ts`) under the
  untrusted-data header; `--json` outputs go through `cleanJson`. A new CLI
  `ctx.out` that interpolates GitHub or registry data without them is a
  finding. A skill never interpolates `$ARGUMENTS` or issue text into a shell
  line.
- **A skill pre-approves only reads.** `allowed-tools` lists the exact read
  subcommand and `<command> *` (`ready`, `dashboard`, `markers`, `resolve`,
  `sessions`, `release-plan`), never `issues.ts *` nor a `cmd*` prefix, and every pattern and command starts
  `bun --no-env-file --config=${CLAUDE_PLUGIN_ROOT}/bunfig.toml` (`skills.spec.ts`);
  `file`, `track`, `deps` and `released` (alias `--dry-run` included) keep
  their permission prompt, and every subcommand refuses an unknown flag.
- **The deny-list refuses rather than shrinks.** An empty private list, an
  owner that drops to 0 against the cache, a stale copy older than 7 days, an
  unexpandable workspace pattern or a missing git root refuses with
  `DenyListIncomplete`; the token's organisations and
  `NXGT_ISSUES_DENY_OWNERS` are deny owners, never filing owners.
  `NXGT_ISSUES_DENY_SKIP_ORGS` is the one deliberate shrink.
- **Both release copies kept in step** (see "Deliberate" below for what may
  differ): a change to the "Fixed in" comment or its hidden marker, the
  discovery rules, the label, close, comment order, or the idempotency rule is
  made in the script files and the lib files alike, with a spec on each side.
- The hook fails open (exit 0; a failed refresh prints nothing, and only a failure of its own shell, such as stdin that is not JSON, prints one `systemMessage`), and makes no gh call for a foreign owner.

## Deliberate — do not report

From the table in `AGENTS.md`:

- `paginate` (offset) and `paginateCursor` (Relay).
- `Principal` and `TokenPrincipal`.
- The REST filter helpers and the GraphQL filter DSL.
- `objectIdFromString` and `toObjectId`.
- `scripts/newest-peers.ts` and its spec, with the "Newest peers" job in
  `ci.yml` — nxgt-data's copy plus `UNINSTALLED`, not shared.
- `scripts/seaweedfs.ts` and its spec, with the "Start SeaweedFS" steps in
  `ci.yml` — nxgt-data's copy, not shared.
- `plugins/{nxgt-autonomy,nxgt-crew,nxgt-economy,nxgt-docs,nxgt-issues}/scripts/lib/hook.ts`
  — the hook shell copied in each plugin, since each installs on its own.
- `plugins/nxgt-issues/scripts/lib/crew-registry.ts` — a read-only copy of
  nxgt-crew's `store.ts`, `record.ts`, `settings.ts`, `liveness.ts` and
  `system.ts` (reader, record check, knobs, liveness, pid probe); its record
  check is looser on purpose.
- The release side of `nxgt-issues`, written twice on purpose:
  `plugins/nxgt-issues/scripts/release/close-released-issues.ts`,
  `close-released-issues-lib.ts`, `close-released-issues-git.ts` and the spec
  (copied byte for byte into each library repository, so standalone: only `gh`,
  nothing imported from the plugin) against `scripts/lib/release*.ts` (what
  `issues.ts released` runs through the plugin's runner). Their different
  behaviour is deliberate, as the `AGENTS.md` row states: the script reads the
  CHANGELOG and ranges the log up to `HEAD` (CI's release commit) and handles
  all published packages together; the lib reads the tag, which must exist
  locally, one package per call, and also builds the notify list. The keyword
  stripping, the changeset frontmatter parser and the `## Versions` parser are
  copies of one rule. Report a change made to one side and not the other, not
  the two sides differing.
- `LICENSE` at the root and in every `packages/*/`.
- `stx-sdk` as a peer of `shared-hono` and `shared-graphql`, and a root
  devDependency.
- `verify:artifacts` reporting the `stx-sdk` subpaths as skipped on a hosted
  runner.
- `scripts/check-nxgt-versions.ts`, its spec and `nxgt-versions.yml`, copied
  from nxgt-janus — the script byte for byte except its header comment, the
  spec except the one package it expects to find (`@nxgt/ory-sdk`).
  nxgt-data holds the third copy, adapted to read `examples/*`; nxgt-http
  has none.
- `@nxgt/ory-sdk`'s peer range `>=0.1.0 <1` in `security` (optional),
  `shared-hono` and `shared-graphql`: the owner's decision, with the `<1`
  ceiling set in `shared-graphql` 3.0, not moved by a lock bump.
- `honoLanguageSource` in `shared-hono/src/i18n/language.ts` and its copy in
  `shared-graphql/src/integrations/hono.ts`: `shared-graphql` does not depend
  on `shared-hono`. Report a change made to one and not the other.

## Layering and packaging

- Layers: the table in `AGENTS.md`. The manifests are the source of truth;
  check `grep -n '"@nxgt/' packages/*/package.json` before reporting a
  layering finding, and report the table if it has drifted from them.
- Changesets, independent versions. `develop` opens the "Version packages"
  PR; merging it publishes through `scripts/publish.ts` and `bun publish`,
  never `changeset publish` or `npm publish`.
- A fix here is a release before it is a consumer PR. A consumer PR opened
  before the version answers on `registry.npmjs.org` is not reviewable.
- `CHANGELOG.md` is generated; a hand edit is a finding, except a line rewritten to remove a private name (an application, or an internal name for the set of applications).
- Commit types: `feat`, `fix`, `update`, `chore`, `docs`, `typo`, and `ci` for the workflows and the setup action.
