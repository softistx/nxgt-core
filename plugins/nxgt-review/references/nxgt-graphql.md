# `code-reviewer` in nxgt-graphql

nxgt-graphql is the Bun workspace of GraphQL building blocks for applications built on the nxgt packages, three public packages:

- **`@nxgt/graphql-scalars`**: GraphQL scalars where one Zod schema checks every crossing. `zodScalar(schema, { name })` and 65 scalars built on it, by category (date-time, identifier, network, number, string, ...), with `scalarTypeDefs` / `scalarResolvers` for a schema-first server, `pickScalars(...names)`, `scalarSchemas` (keyed by GraphQL name, read by the codegen plugin), `schemas`, graphql-codegen's `codegenScalars` (server) and `clientCodegenScalars` (client), `graphql/scalars.graphqls` and the `nxgt-graphql-scalars typedefs` bin. The schemas themselves live in `@nxgt/zod` (softistx/nxgt-zod), which the package re-exports.
- **`@nxgt/graphql-validation`**: `@constraint` on arguments and input fields, checked by a Zod schema built from the directives (`constraintTypeDefs`, `withValidation(schema, { formats? })` (the application's own formats, a record of Zod string schemas), `validated`, `badUserInput`), one `BAD_USER_INPUT` error, the `nxgt-graphql-validation typedefs` bin.
- **`@nxgt/graphql-codegen-zod`**: a graphql-codegen plugin writing Zod schemas and types from the SDL (enums, inputs, field arguments, operation variables, object types, interfaces, unions, operation results and fragments), with every `@constraint` through `@nxgt/graphql-validation/codegen`.

Packages are published to npmjs. The repository and every package are public from the start.

A package here is named `@nxgt/graphql-<what>`. A new package named `@nxgt/<what>` is a finding.

## Measure

```bash
find packages/*/src scripts -name '*.ts' ! -name '*.spec.ts' -exec wc -l {} + | sort -rn | head -20
```

The green bar, as CI runs it (in this order, with no service container):

```bash
bun install
bunx biome ci
bun run build            # before typecheck: every `exports` points at dist/
bun run typecheck        # packages and scripts
bun run test
bun run verify:artifacts # packs, installs and imports every declared subpath
bun run changeset:status # on a branch cut from develop
```

You may run all of them. Never run `changeset:publish`, `scripts/publish.ts` or `bun changeset`. CI's "Newest peers" job runs `scripts/newest-peers.ts`, deletes `bun.lock`, installs and reruns build, typecheck, test and `verify:artifacts` on graphql 17, the latest zod 4 and TypeScript 7. A spec that drives TypeScript's compiler API imports TypeScript 6 as `typescript-api` (TypeScript 7 has no compiler API). A change to `zod-scalar.ts`, or to a spec that calls a scalar's methods, is not checked until it has run there. That job resolves without a lockfile, so an upstream release can turn it red with no change here: read it, do not make it a required check.

## Invariants

Each is a public promise, proved by a spec. Weakening one is a breaking change, even with every spec green.

### Across the repository

- **graphql 16 and 17 both work**, in `graphql-scalars` and `graphql-validation` alike. `zodScalar` passes the legacy `serialize`, `parseValue` and `parseLiteral`, and also `coerceOutputValue`, `coerceInputValue` and `coerceInputLiteral`, which graphql 17 calls instead. The config is built in a variable, not passed as a literal: inlining it makes graphql 16's config type refuse the names it lacks.
- **A spec calls `parseLiteral(node, undefined)`.** graphql 17 types it with two parameters; the one-argument form passes `tsc` on 16 and fails on 17, and only the "Newest peers" job sees it.
- **Source imports carry no extension, and the emitted declarations do.** `build.ts` gives every relative import of an emitted `.d.ts` its `.js` (or `/index.js`). A failure under `nodenext` (TS2305, a name lost through a re-export) is a bug, not a quirk: a consumer resolving as Node does must work. `verify:artifacts` checks each `test/declarations/<package>.ts` fixture twice, under `bundler` and under `nodenext`, and `build.ts` fails a declaration with a relative import still lacking an extension (`declarationSpecifiers`). A change that drops the `nodenext` probe, or makes `dts-imports.ts` stop skipping imports written in a comment, is a finding.
- **A source folder is never named `build`, `dist`, `coverage` or `node_modules`.** `tsconfig.base.json` excludes them and a package's `tsconfig.json` has no `include`, so such a folder is out of `bun run typecheck` and only the build sees its type errors (`src/builder/`, not `src/build/`).
- **Generated files are never edited by hand**: `packages/graphql-scalars/graphql/scalars.graphqls` (`bun run --cwd packages/graphql-scalars typedefs:write`), `packages/graphql-validation/graphql/constraint.graphqls` (`typedefs:write`) and `packages/graphql-codegen-zod/test/generated.ts` (`bun run --cwd packages/graphql-codegen-zod generated:write`). A spec fails, naming the command, when one is stale. The `.graphqls` files are in `files`, not in `exports` (`verify:artifacts` imports every `exports` key and a `.graphqls` is no module); consumers reference them by path.

### `@nxgt/graphql-scalars`

- **Registration is by file; nothing is listed by hand.** A new scalar is a file, its spec and one line in its category's `index.ts`, once its schema is published in `@nxgt/zod`; a new category is a folder and one line in `scalars/all.ts`. `scalarResolvers`, `scalarSchemas`, `schemas`, `scalarTypeDefs`, `codegenScalars` and `clientCodegenScalars` are derived from what `all.ts` exports. A hand-written list of scalars anywhere else is a finding. `scalars/registry.spec.ts` fails a file that is unregistered, has no spec, exports anything but one scalar and one schema, is not named after its scalar (`DateTime` in `date-time.ts`, exports `DateTimeScalar` and `dateTimeSchema`), or has no `## \`<Name>\`` section in `docs/guide/scalars/<category>.md`. A type-only export is invisible to that guard.
- **The package root exports only** a `*Scalar`, a `*Schema`, `zodScalar`, `pickScalars`, `scalarResolvers`, `scalarSchemas`, `schemas`, `scalarTypeDefs`, `codegenScalars` or `clientCodegenScalars` (`src/index.spec.ts`). A helper that reaches the root is a finding. A schema export that does not end in `Schema` is one (a bare `url` or `date` would read as something else at the root). An integer scalar (`literals: 'integer'`) whose spec does not call `integerCases` is one.
- **`scalarSchemas` is a contract with code generators.** Its name, its keys (the GraphQL names, as `scalarResolvers`') and each entry being the very schema the scalar checks, typed exactly, are read by `@nxgt/graphql-codegen-zod`'s generated code (`typeof scalarSchemas.X`). `scalar-schemas.spec.ts` pins all three, and that it is `@nxgt/zod`'s `scalarSchemas` entry for entry (`===`, same keys, same order).
- **`codegenScalars` and `clientCodegenScalars` are derived, never written per scalar**, from each schema's Zod definition (`src/codegen-scalars.ts`). `codegen-scalars.spec.ts` asks tsc for `z.input` / `z.output` of every scalar and holds each entry to that text.
- **One schema checks both ways.** An input goes through `z.safeDecode`, a resolver's result through `z.safeEncode`. A result the encoding refuses is decoded first, as a client's value would be, then encoded: a resolver may return the wire form and what goes out is canonical either way. A value neither way takes is refused with the encoding's issue, never written to the wire as it is. A schema that changes a value must be a `z.codec`; a `.transform()` has no way back and is a finding.
- **A refusal never names the value.** The message reads `<Name> cannot represent this input: <issue>` or `<Name> cannot serialize this value: <issue>`, with Zod's first issue only.
  - A built-in schema whose issue echoes the input is a finding. Our own messages read `Invalid <format>[: hint]`, the hint saying what to send, never what was sent.
  - A refused literal carries its AST node.
  - What Zod throws rather than fails on (a `.transform()` on the way out, an async check, a codec's own error) comes back as a `GraphQLError`, the original as its `originalError`.
  - Not ours to report: a user schema's own message, and graphql 16 adding a bad variable's value to its own message.
- **An input is taken in its canonical form only.** A scalar refuses a variant spelling rather than rewriting it (`007`, `-0`, `-00:00`, a URL with a tab), so the resolver receives what the client sent. Zod's own rewrites are refused before they happen (`URL` refuses the white space `z.url()` would trim). Hex digits and the letters of `UUID`, `UUIDv4`, `UUIDv7`, `GUID`, `ULID`, `ObjectID`, `SHA256`, `SHA512`, `Hexadecimal`, `HexColorCode`, `IPv6`, `CIDRv6` and `MAC` are taken in any case, mixed included, and kept as sent; where the format's own reference reads one case only (rs/xid's `XID`), the scalar takes that case only.
- **`DateTime` is an instant, `Date` is not.** `DateTime` requires an offset (not `-00:00`, `@nxgt/zod`'s `src/rules/offset.ts`, shared with `Time` and `UtcOffset`), resolves to a `Date`, serializes a `Date` or a valid RFC 3339 string, and writes UTC. The fraction is cut to three digits before `new Date` reads it, so no engine's parser is involved, and an instant outside 0000-01-01 to 9999-12-31 UTC is refused both ways. `Date` stays a `YYYY-MM-DD` string on both sides; turning it into a JS `Date` is a finding (the value shifts by a day in half the time zones).
- **`URL` is `http:` or `https:` only.** Plain `z.url()` accepts `javascript:` and a client is likely to put the value in an `href`. The protocol pattern must stay exactly `/^https?$/` (Zod reads that source to also refuse `https:example.com`), and a spec reads the check's `protocol` source and pins it. On top of Zod: the scheme lowercase; a host that is a `Hostname` (`@nxgt/zod`'s `src/rules/hostname.ts`), a canonical IPv4 or a bracketed IPv6, never what only a URL parser reads as one (`https://123`, `https://0x7f.1`, `a_b.com`); an optional port with no leading zero; no user info; no white space, control or invisible format character (`\p{Cf}`). What a parser rewrites to an equivalent is kept as sent (uppercase host, `:443`, dot segments, percent-escapes). That check runs before `z.url()`, as a check of the same `z.string()` rather than a pipe, so it sees the value Zod would trim.
- **`PositiveInt`, `NegativeInt`, `NonNegativeInt` and `NonPositiveInt` are 32 bits**, as GraphQL's `Int` is. `SafeInt` (±(2⁵³ − 1)), `Long` (64 bits) and `BigInt` (unbounded) are not, and say so in their name.
- **`Long` and `BigInt` are a string on the wire, always**: a `bigint` in the resolvers; as input a canonical decimal string or a safe-integer number. A number past 2⁵³ is refused, never rounded, from a client or a resolver.
- **An integer scalar reads literals as GraphQL's `Int` does**: a float literal (`1.0`, `1e3`) is refused through `zodScalar`'s `literals: 'integer'`, and so is `-0`. `integerCases()` in `test/scalar-cases.ts` proves both for each one.
- **`TimeZone` is what the runtime's `Intl` knows, aliases included**, kept as sent; Node and Bun disagree on which name is canonical, so an alias is not refused. An offset is `UtcOffset`'s, never a `TimeZone`.
- **`JSON` and `JSONObject` read every literal** (`literals: 'any'`) and refuse both ways what JSON cannot write back as it is: a cycle, `undefined`, a hole, a `Date`, `NaN`, `-0`, nesting past 1000 levels. A variable inside a literal is read as graphql 17's `replaceVariables` reads it, on 16 too (`untypedValue` in `zod-scalar.ts`, not graphql 16's `valueFromASTUntyped`). Two graphql 16 limits a scalar cannot fix, not to be reported: a custom-scalar variable inside the literal arrives as its resolver value, and an object or list default for a `JSON` argument makes introspection and `printSchema` throw.
- **`Void` is `null` only.** A resolver that returns a value is refused, not silently dropped.
- **`Locale`'s canonical form is checked here, not taken from `Intl`** (V8 and JavaScriptCore rewrite different CLDR aliases): `Intl` only says the tag is well-formed, and `@nxgt/zod`'s `locale.ts` checks the rest. An alias is kept as sent. Replacing that check with `Intl.getCanonicalLocales` is a finding.
- **The `typedefs` bin** (`cli.ts`, `typedefs-command.ts`) exits 0 done, 1 write failed, 2 usage error. With no names it prints exactly `graphql/scalars.graphqls`.

### `@nxgt/graphql-validation`

- **A new rule or format is a file, its spec and one line in its `all.ts`** (`rules/` one `@constraint` argument per file, `<argument>Rule`; `formats/` one `<name>Format`). The directive's SDL, the registry, `constraintOf` and the known formats follow. `registry.spec.ts` fails an unregistered file, one without a spec, one exporting anything else, or one not named after its argument (`minLength` in `min-length.ts`, `minLengthRule`).
- **Every rule and format is written twice**: `toZod` (applied at startup) and `toCode` (the same schema as source for a code generator, `z` a free identifier). Each spec goes through `test/rule-cases.ts`, which evaluates the source and requires both to accept and refuse the same inputs, and every refusal to be owned (`owns`) by that rule and no other. A rule with only one of the two is a finding.
- **Rules, formats and the builder are internal.** `./codegen` exports only `checkConstraints`, `constraintsOn`, `inputCode` and the types `Constraint` and `InputCodeOptions`. Of a `Constraint`'s `rule`, `argument`, `target` and `base` are public; widening it is a public-API decision. `withValidation` runs its startup checks through `checkConstraints`, so the generator refuses the same schemas.
- **`inputCode` mirrors `InputSchemas`.** Both refuse a constraint that cannot apply through `assertLeafTargets` / `assertObjectTargets` (one message), and `input-code.spec.ts` requires the generated source to accept and refuse what the runtime does. A change to one walk without the other is a finding.
- **`@constraint` is never a silent promise.** It is declared on `ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION` only. `withValidation` throws, naming the place, on a constraint that cannot apply (wrong kind, custom scalar, enum, input object, list rule off a list, unknown format, bad pattern), in every input type whether an argument reaches it or not; on a `@constraint` declared otherwise than `constraintTypeDefs` (repeatable included); on one on a directive's argument; on a default that breaks its own constraint, coerced as graphql coerces it; and on an object field that drops or changes the `@constraint` its interface writes on an argument.
- **The resolver receives the parsed arguments, and nothing else changes.** An absent argument or input field stays absent, a `@oneOf` input keeps its one key, a field with nothing to check is not wrapped, wrapping twice wraps nothing, and a subscription is checked once, in `subscribe` (graphql's default one when the field has none).
- **One error shape.** `Invalid arguments for <Type>.<field>. <path>: <first message>`, `extensions.code` `BAD_USER_INPUT`, `extensions.issues` each with its path relative to the arguments, Zod's `code`, and `constraint` when a directive refused. `validated` and `badUserInput` raise the same, without `constraint`.
- **An application's format is a Zod string schema, and changes nothing.** `withValidation(schema, { formats })` and the two `./codegen` exports take the same record. Keys match `/^[a-z][a-z0-9-]*$/` and never name a built-in format. The definition is `type: 'string'` (no pipe, transform or codec), and nothing in it rewrites the value: `trim`, case changes (`.toLowerCase()`, `.toUpperCase()`, `.normalize()`, `.slugify()`, `.overwrite()`), `coerce` and `url` (`z.url()`, `z.httpUrl()`) are refused at startup and at generation (`rewrites`). A runtime backstop (`marked`) throws a plain `Error` naming the format when a parse's output differs from its input. Weakening the audit or the backstop is a finding.
- **Every refusal of an application's format carries `constraint: 'format'`**, whatever the issue's Zod code (`marked` re-raises it with `params.nxgtConstraint`, and `constraintOf` reads that before any `owns`). An async check runs once per value; `checkDefaults` throws on a default that needs one.
- **`uri` is http, https or ftp with the scheme required; `date-time` is canonical RFC 3339 with `Z` or an offset.** Both stricter than graphql-constraint-directive, on purpose, each pinned by a spec. `uri` is the one documented exception to "the resolver receives what was sent": `z.url()` trims, and the generated client runs the same schema. An application's format may not do this.
- **The `typedefs` bin exits 0 done, 1 the file could not be written, 2 a usage error**, nxgt-mongo-backup's convention, and runs under Node and Bun. `--out` alone writes `generated/graphql/constraint.graphqls`, and `--help` / `-h` anywhere wins.

### `@nxgt/graphql-codegen-zod`

- **The client refuses what the server refuses.** `plugin.spec.ts` serves the fixture behind `withValidation` and runs each case both ways, operation by operation. A change to how a value is written without that proof is a finding.
- **The plugin refuses what `withValidation` refuses**, with its message: it runs `checkConstraints` before writing anything, with the application's formats loaded from `formatSchemas` / `zodFormats`. It fails rather than write a weaker schema on a custom scalar with no mapping (never `z.unknown()`), a variable passed to two different `format`s, and a schema that declares `@constraint` without SDL.
- **An application's format is loaded, never trusted.** A format module that cannot be imported fails generation, naming the option; the generated file imports the user's schema (`formatSchemas.slug.max(12)`) and chains the other rules on it, built-in formats staying inline, and the client's issues carry no `constraint`. `formats.spec.ts` pins messages and config errors; `plugin.spec.ts` serves the fixture behind `withValidation(schema, { formats })`. A fallback to `z.unknown()` or to trusting an unloadable module is a finding.
- **Input types are `z.strictObject`**; variables and args objects stay `z.object`. Defaults are coerced as graphql coerces them, through lists and nested input literals.
- **Every list takes a single value, as graphql does**, through `inputCode`'s `list` option: the value is wrapped, then piped into the list's schema, so the client's issue is the server's. An Int for an ID stays refused.
- **Output types are what a resolver returns**: `z.object` (an unknown field is dropped), `__typename` optional, custom scalars decoded, interfaces and unions a plain `z.union` declared after every object type, objects reaching each other through getters. `objects: false` writes none.
- **Operation results are what the response holds**: `z.output`, custom scalars decoded, `z.object`, fragment spreads inlined. A selection on an abstract type is a `z.discriminatedUnion` on `__typename` only when its possible types select different fields, and then `__typename` must be selected under one key for every member, else generation fails. Past 5 nested levels a selection is declared apart so TypeScript infers any depth. A field under `@skip` / `@include` / `@defer` is `.optional()`; a nullable field is `.nullable()`; an introspection field is `z.unknown()`. `operations: false` writes none and keeps the variables.
- **A type in a cycle has its types written out** (`Filter`, `FilterInput`, `zFilter: z.ZodType<Filter, FilterInput>`; `outputCycles` for outputs), as a transform around a type inside its own getter defeats inference. Types outside a cycle stay derived (`z.output<typeof zX>`). `type-code.ts` mirrors `Writer.value`'s optionality, and `test/types.ts` pins the types field by field with `Equal`. One name declared twice, per kind, fails generation.
- **A default is `.prefault(v)` then `.nullable()`**: optional in `z.input`, present in `z.output` (`test/types.ts` pins it). `.default` would not run a nested input's own defaults; `.nullish()` before `.prefault` would keep `undefined` in the output type.
- **Names follow the typescript plugins** (`@graphql-codegen/visitor-plugin-common`'s `convertFactory`): `Args`, variables, results and fragments, with the suffix following `omitOperationSuffix` / `dedupeOperationSuffix`. A name changed without reading that code is a finding.
- **The real scalar record and `@nxgt/zod` are parity targets.** `real-scalars.spec.ts` checks every `@nxgt/graphql-scalars` key is mapped and that the client takes, refuses and decodes what a server with `scalarResolvers` does (codecs to `Date` and `bigint` included); `nxgt-zod.spec.ts` checks `@nxgt/zod`'s `scalarSchemas` has the same keys in order, behaves the same on every probe (each scalar takes at least one), and that `scalarSchemas: '@nxgt/zod'` generates the same file with only the import changed.

## Structure

The default thresholds apply (250 lines per file). AGENTS.md sets no others. The layout is built to grow: a hundred scalars, rules or formats are files in a folder, and a finding is a change that makes adding one touch anything beyond its file, its spec and one `export *` line.

## Deliberate — do not report

From `AGENTS.md`, "Declared divergences from nxgt-data" and "Deliberate duplication":

- **No `"private": true` on any package**, even before its first release. The owner decided this, against the skill's rule. The root `package.json` is private, which is correct: the root is never published. What publishes is the merge of a "Version packages" pull request on `develop`; a package with no changeset is not in it.
- **`ci.yml` differs from nxgt-data's.**
  - It has no service caches.
  - It does not run on `push` to `develop`.
  - Its timeouts are 15 minutes, against nxgt-data's 25.
- **Absent on purpose:**
  - nxgt-data's `check-nxgt-versions`, `meilisearch`, `redis` and `seaweedfs` scripts;
  - `nxgt-versions.yml`;
  - an `examples/` workspace.
- **The artifact probe and the verify temp folder are named `nxgt-graphql-*`** (`scripts/artifacts/install.ts`, `scripts/verify-artifacts.ts`). These are the only two lines in `scripts/` that differ from nxgt-data's.
- **Kept twice on purpose:**
  - `LICENSE` at the root and in each `packages/*/` (npm ships only the one in the package's directory; `verify:artifacts` fails a tarball without one).
  - Byte copies of nxgt-data's: `bunfig.toml`, `.gitignore`, `tsconfig.base.json`, `tsconfig.json`, `scripts/tsconfig.json`, `build.ts`, `biome.json`, `scripts/artifacts/` and `scripts/verify-artifacts.ts` (bar the two lines above), `scripts/workspace.ts`, `scripts/publish.ts`, `scripts/newest-peers.ts` and their specs, and the "Newest peers" job in `ci.yml`. A drift is fixed in nxgt-data first.
  - `.github/actions/setup/action.yml`, `release.yml`, `deprecate.yml` and the `ci` job of `ci.yml` (nxgt-di's, which are nxgt-data's without its servers), and `CLAUDE.md` and `.claude/settings.json` (nxgt-di's, byte for byte).
  - `src/cli.ts` and `src/typedefs-command.ts` in both `graphql-scalars` and `graphql-validation`: each package ships its own `typedefs` bin and neither depends on the other. A change to one bin's flags or exit codes is made in the other.
  - The 65 scalar names (GraphQL names and `<name>Schema` exports) are also copied outside this repository: `@nxgt/typespec` (softistx/nxgt-http) pins them in `test/scalars/index.ts` (`GRAPHQL_SCALARS`). The rules are not copied: they live in `@nxgt/zod`. Adding or renaming a scalar is a PR in `@nxgt/zod` first and the same change in `@nxgt/typespec`.
- **A rule of a scalar is changed in softistx/nxgt-zod, not here.** A spec here that expects new behaviour stays red until the `@nxgt/zod` range in `packages/graphql-scalars/package.json` is bumped. Not a finding in this repository: the scalar's options (name, description, `specifiedByURL`, `literals`) and `zodScalar` stay here.
- **`@nxgt/graphql-scalars` and `@nxgt/zod` are devDependencies of `graphql-codegen-zod`**, never dependencies: the plugin reads a scalar record by the module name its config gives.

## Layering and packaging

- `@nxgt/graphql-scalars` depends at runtime on `@nxgt/zod` only, by an npm range (another repository, so never `workspace:`); `@nxgt/zod` peers the same `zod` range, so an application holds one `zod`. Peers: `graphql`, `zod`, `typescript`.
- `@nxgt/graphql-validation` depends on nothing at runtime. Peers: `graphql`, `zod`, `typescript`. It and `graphql-scalars` do not depend on each other.
- `@nxgt/graphql-codegen-zod` depends on `@nxgt/graphql-validation` (its `./codegen` subpath) and `change-case`, never on scalars (nor on `@nxgt/zod` at runtime). Peers: `graphql`, `zod`, `typescript`.
- `graphql` (`^16.11.0 || ^17.0.0`) and `zod` (`>=4.6.5 <5`) are each pinned exactly as a devDependency at the oldest end of their range (`16.11.0`, `4.6.5`). A peer pinned at the newest end hides a break on the oldest. `typescript` is `^6.0.3 || ^7.0.0` in all three packages (TypeScript 7 is covered by the "Newest peers" job).
- The `zod` range is nxgt-data's (`@nxgt/mongo`, `@nxgt/redis`); one that differs puts two zods in an application's tree, which is a finding.
- Siblings depend on each other by `workspace:^`.
- The shared root files and `scripts/` are byte-for-byte copies of nxgt-data. Check them with the `diff` loop from `nxgt-monorepo:lay-out-a-library-monorepo`.
- `verify:artifacts` packs every package, installs the tarballs as a consumer does and runs the stages of `scripts/artifacts/`, stopping at the first that fails. A build that exits 0 is no evidence the artifact loads. `test/declarations/<package>.ts` is what `emit.ts` emits under a consumer's strict settings: an exported value whose inferred type names something the entry does not export fails there with TS2883.
