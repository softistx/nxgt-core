# `code-reviewer` in nxgt-graphql

nxgt-graphql is the Bun workspace behind `@nxgt/graphql-scalars`: GraphQL
scalars where one Zod schema checks every crossing. It offers
`zodScalar(schema, { name })` and seven scalars built on it (`DateTime`,
`Date`, `EmailAddress`, `URL`, `UUID`, `NonEmptyString`, `PositiveInt`).
Packages are published to npmjs. The repository and every package are public
from the start.

A package here is named `@nxgt/graphql-<what>`. A new package named
`@nxgt/<what>` is a finding.

## Measure

```bash
find packages/*/src scripts -name '*.ts' ! -name '*.spec.ts' -exec wc -l {} + | sort -rn | head -20
```

The green bar, as CI runs it:

```bash
./node_modules/.bin/biome ci
bun run build              # before typecheck: every `exports` points at dist/
bun run typecheck
bun run test
bun run verify:artifacts
bun run changeset:status
```

You may run all of them. Never run `changeset:publish`, `scripts/publish.ts`
or `bun changeset`. CI's "Newest peers" job reruns the bar on graphql 17 and
the latest zod 4. A change to `zod-scalar.ts`, or to a spec that calls a
scalar's methods, is not checked until it has run there.

## Invariants

Each is a public promise. Weakening one is a breaking change, even with every
spec green.

- **graphql 16 and 17 both work.** `zodScalar` passes the legacy
  `serialize`, `parseValue` and `parseLiteral`. It also passes
  `coerceOutputValue`, `coerceInputValue` and `coerceInputLiteral`, which
  graphql 17 calls instead. The config is built in a variable, not passed as
  a literal. Inlining it makes graphql 16's config type refuse the names it
  lacks.
- **A spec calls `parseLiteral(node, undefined)`.** The one-argument form
  passes `tsc` on 16 and fails on 17, and only the "Newest peers" job sees it.
- **One schema checks both ways.** An input goes through `z.safeDecode`, and
  a resolver's result goes through `z.safeEncode`. A result that does not fit
  is refused, never written to the wire as it is. A built-in scalar whose
  schema changes a value with `.transform()` instead of `z.codec` is a
  finding, because a transform has no way back.
- **A refusal never names the value.** The message reads `<Name> cannot
  represent this input: <issue>` or `<Name> cannot serialize this value:
  <issue>`, with Zod's first issue only.
  - A built-in schema whose issue echoes the input is a finding.
  - A refused literal carries its AST node.
  - What Zod throws rather than fails on comes back as a `GraphQLError`, with
    the original as its `originalError`.
  - Not ours to report: a user schema's own message, and graphql 16 adding a
    bad variable's value to its own message.
- **`DateTime` is an instant, `Date` is not.**
  - `DateTime` requires an offset, resolves to a `Date`, serializes only a
    `Date`, and writes UTC.
  - `Date` stays a `YYYY-MM-DD` string on both sides. Turning it into a JS
    `Date` is a finding: the value shifts by a day in half the time zones.
- **`URL` accepts `http:` and `https:` only.** The protocol pattern must stay
  exactly `/^https?$/`, and a spec pins it. Zod reads that pattern's source to
  also refuse `https:example.com`. Plain `z.url()` accepts `javascript:`.
- **`PositiveInt` is 32 bits**, as GraphQL's `Int` is.

## Structure

The default thresholds apply (250 lines per file). AGENTS.md sets no others.

## Deliberate — do not report

From `AGENTS.md`, "Declared divergences from nxgt-data":

- **No `"private": true` on any package**, even before its first release. The
  owner decided this, against the skill's rule. The root `package.json` is
  private, which is correct: the root is never published.
- **`ci.yml` differs from nxgt-data's.**
  - It has no service caches.
  - It does not run on `push` to `develop`.
  - Its timeouts are 15 minutes.
- **Absent on purpose:**
  - nxgt-data's `check-nxgt-versions`, `meilisearch`, `redis` and `seaweedfs`
    scripts;
  - `nxgt-versions.yml`;
  - an `examples/` workspace.
- **The artifact probe and the verify temp folder are named `nxgt-graphql-*`.**
  These are the only two lines in `scripts/` that differ from nxgt-data's.
- **Imports have no extension.** A failure that only shows under `nodenext` is
  not a bug.

## Layering and packaging

`@nxgt/graphql-scalars` has no runtime dependency. `graphql`
(`^16.11.0 || ^17.0.0`), `zod` (`>=4.6.5 <5`, nxgt-data's range) and
`typescript` are peers.

- `graphql` and `zod` are each pinned exactly as a devDependency at the
  oldest end of their range. A peer pinned at the newest end hides a break on
  the oldest. `typescript` is `^6.0.3`.
- A zod range that differs from nxgt-data's puts two zods in an application's
  tree, which is a finding.
- Siblings depend on each other by `workspace:^`.
- The shared root files and `scripts/` are byte-for-byte copies of nxgt-data.
  Check them with the `diff` loop from
  `nxgt-monorepo:lay-out-a-library-monorepo`.
