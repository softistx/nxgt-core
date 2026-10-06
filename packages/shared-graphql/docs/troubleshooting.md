# Troubleshooting `@nxgt/shared-graphql`

Each entry is headed by the message you see; the parts in `<angle brackets>`
vary. Messages thrown when the server starts or the schema is built are
`TypeError`s, and stop the server from booting; the schema ones name
`Type.field` after the directive that carries the mistake. The last section
holds the traps that throw nothing.

Upgrading from 2.x, most of these come from [the
migration](./guide/migrating-to-3.md).

## When the server starts

### ``useAuth(): name the gateway allowed to set the caller — useAuth({ trustedGateway: gatewaySecret({ secret }) }). …``

Also `extractJwtPlugin(): name the gateway allowed to set the caller — …`.

Since 3.0 both need to know which gateway may put the caller in the request's
`extensions`, which a client can otherwise write. Pass one:

```ts
const trustedGateway = gatewaySecret({ secret: process.env.GATEWAY_SECRET! });
createYoga({ plugins: [useAuth({ trustedGateway })] });
new ApolloServer({ plugins: [extractJwtPlugin({ trustedGateway })] });
```

`extractJwtPlugin` is a function now: `plugins: [extractJwtPlugin]` passes
the function itself, not a plugin. An API that authenticates its own callers
uses `useOryAuth(ory)` and needs neither.

### ``gatewaySecret(): `secret` must be a string of at least 16 characters — is its environment variable set?``

The secret is missing or shorter than 16 characters — most often an
environment variable that is not set where the server runs. Set it, to the
same value the gateway sends.

### `Cannot find module '@envelop/generic-auth'`

Or `@graphql-hive/gateway`, `@envelop/extended-validation`,
`@hono/zod-validator`, `zod`. 3.0 dropped them from its dependencies — nothing
here imported them — and your app was using the copy this package brought.
Declare it yourself:

```sh
bun add @envelop/generic-auth
```

### ``Module '"@nxgt/shared-graphql"' has no exported member 'sandboxExpolorer'. Did you mean 'sandboxExplorer'?``

The typo was corrected in 3.0, with no alias. Import `sandboxExplorer`.

## When the schema is built

### ``@check on <Type.field>: @check was removed in @nxgt/shared-graphql 3.0 — write one @permission(name: "<permit>", type: "<namespace>") per term, and move an OR into the Keto model``

The schema declares 2.x's `@check` itself and a field still uses it. This
package no longer answers it, so the field would boot unguarded; it is refused
instead. Rewrite it:

```graphql
# before
note(id: ID!): Note @check(permissions: [[{ namespace: "Note", permit: "view" }]])
# after
note(id: ID!): Note @permission(name: "view", type: "Note")
```

Then drop your `@check` declaration. [The migration guide](./guide/migrating-to-3.md#2-check-is-removed)
covers an AND and an OR.

### `Unknown directive "@check".`

The same, in a schema that loads this package's `graphql/` and nothing else:
3.0 no longer ships `@check`'s declaration. Rewrite the field as above.

### ``@permission on <Type.field>: `id` must be "args.<path>", "parent.<path>" or "source.<path>", got "<id>"``

The `id` argument names no root. Prefix it:

```graphql
note(noteId: ID!): Note @permission(name: "view", type: "Note", id: "args.noteId")
```

### ``@permission on <Type.field>: `id` reads "args.<name>", but the field declares <arguments>``

The path reads an argument the field does not have — usually the default
`args.id` on a field whose argument is named otherwise. graphql-js never puts
an undeclared argument on `args`, so every request would have failed. Name the
argument in `id`, or read the parent with `parent.<path>`.

In 2.x a `@check` booted with this and logged a warning; a `@permission`
refuses it.

### ``@permission on <Type.field>: every term needs `namespace`, `permit` and `id`, got <term>``

`@permission(name: "", type: "Note")`: an empty `name` or `type`. Name both.

### `@permission on <Type.field>: unknown namespace "<type>" — known: <namespaces>`

You passed `namespaces` to `useKetoChecks` / `applyKetoChecks`, and the field
names one outside them — most often a typo. Keto would have answered `false`
for ever, without an error. Fix the name, or add the namespace to the list
when the OPL document gained it.

### `<Type.field>: @permission on an interface field guards nothing — no resolver runs there. Put it on each implementing type's field`

A resolver runs on an object type's field, never on an interface's. Move the
directive to every implementing type:

```graphql
interface Node { id: ID! }
type Note implements Node {
	id: ID!
	body: String @permission(name: "view", type: "Note", id: "parent.id")
}
```

In 2.x a `@check` there booted with a warning; a `@permission` is refused.

### ``@authenticated on <where>: `type: []` admits no caller — name a type, or drop `type` ``

`<where>` is where the directive sits: `Type.field`, or a type, interface,
scalar or enum name.

An empty list admits nobody. Name the kinds of caller, or drop `type` to
admit any caller.

### `@authenticated on <where>: unknown type "<type>" — known: <types>`

`type:` names a value outside the caller types `useAuthenticated` knows —
`session` and `token` by default. Fix the name, or list your own:

```ts
useAuthenticated({ types: [...CALLER_TYPES, 'service'] });
```

### ``@authenticated on <Type.field>: the field's, its type's and its interfaces' `type`s have none in common — no caller could pass``

Every `@authenticated` that applies to a field must hold — the field's, its
type's, its interfaces'. Two of them name disjoint types, so no caller could
reach the field. Drop or widen one.

### `Unknown argument "type" on directive "@authenticated".`

The schema declares `@authenticated` without an argument — federation's
declaration, imported through `@link`, or your own — and a field writes
`type:`. In a subgraph keep federation's form and drop `type:`; in a schema
of your own, load `SHARED_TYPE_DEFS` or `AUTHENTICATED_DIRECTIVE_SDL` in place
of your declaration.

### `@nxgt/shared-graphql: no package root`

Thrown when the package is imported, if no `package.json` sits anywhere
above its files — a bundle copied into an image without one. The more common
case throws nothing: a bundler inlined the package into your app's bundle, the
walk finds your app's `package.json`, and `SHARED_SCHEMA_PATH` points at
`<app>/graphql/**`, which loads no SDL. Either way, mark
`@nxgt/shared-graphql` external in the bundler so it stays on disk as
installed.

### `Directive "@permission" argument "name" of type "String!" is required, but it was not provided.`

On graphql 17: `Argument "@permission(name:)" of type "String!" is required, but it was not provided.`

Your schema declares its own `@permission`, and you load this package's
`graphql/**/*.graphqls` (`SHARED_SCHEMA_PATH`) beside it: `mergeTypeDefs`
merges the two declarations into one with both sets of arguments, and your
usages lack `name` and `type`. `@permission` and `PermissionDenial` are
names this package ships. Load only the folders you need —
`graphql/scalars`, `graphql/schema` — or rename your directive.
`useKetoChecks` itself leaves a `@permission` without `name` and `type`
alone.

### `Cannot use GraphQLSchema "<schema>" from another module or realm.`

Two copies of `graphql` are installed: `graphql` is a peer of this package
(`^16.9.0 || ^17.0.0`), so your app must declare it once, and every GraphQL
library must resolve that one. Add `graphql` to your `dependencies` if it was
only there through this package, and check with `bun pm ls graphql` (or
`npm ls graphql`) that one version remains. graphql runs this check only
when `NODE_ENV` is not `production`; in production two copies fail later,
with less telling errors.

## When a request runs

### `<Type.field>: "<path>" resolved no object id`

A plain `Error` thrown inside a resolver: `createMaskError` answers the client
`Unexpected error.` (`INTERNAL_SERVER_ERROR`); the text is in the server log,
and in `extensions.debugMessage` when `isDev` is on.

The path was valid, but at request time it pointed at nothing — a nullable
argument nobody passed, an empty list, a parent field the parent resolver did
not load. It is a 500, never an allow. Make the argument required, or make
sure the parent object carries the field.

### `<Type.field>: no checker on the context — useKetoChecks(ory) is not registered`

The schema was transformed with `applyKetoChecks` but the plugin that puts the
per-request checker on the context is missing. Register
`useKetoChecks(ory)` after `useOryAuth(ory)`. Answered as the previous entry.

### `can(): no checker on the context — useKetoChecks(ory) is not registered`

The same, from `can`.

### `ory: keto is unavailable` with `SERVICE_UNAVAILABLE` and HTTP 503

Keto (or Kratos, Hydra — the name varies) did not answer. This is on
purpose: an outage is never turned into a denial or an anonymous caller. The
client can retry; `extensions.debugMessage` carries what the SDK saw.

### A denial's message reads `notes.errors.not-found`

A `@permission(message: "notes.errors.not-found")`, or your own
`denial(code, key)`, reached the client untranslated. A denial translates its
key with `@nxgt/i18n`'s own resources, which do not hold your app's keys.
Register the mask with your translator:

```ts
createYoga({ maskedErrors: { maskError: createMaskError(translate) } });
```

Under Apollo Server, the counterpart is `formatError: createFormatError(translate)`.

### `Unexpected error.` with `INTERNAL_SERVER_ERROR` where a service's 404 or 403 was expected

A service threw a `CustomException` and `createMaskError` is not registered,
so Yoga masks it as any non-GraphQL error. The directives and `requireUser` /
`can` are not concerned — their denials carry their own status — but a
service's `CustomException.notFound()` is. Register `createMaskError`, as
above, or throw `denial(code, message)` from the resolver.

### `Unexpected error.` where a resolver's own message used to reach the client

`createMaskError` masks a plain `Error` a resolver threw, as Yoga's default
does. Throw a `CustomException`, a `denial()` or a `GraphQLError` for a
message meant for the caller.

### `Unexpected error.` from Apollo Server, and no `debugMessage`, in production

`createFormatError(translate, true)` masks an unexpected error and removes
every `extensions.debugMessage` and `extensions.stacktrace` in production: a
client reads no internal detail. Read the cause in the server's log — an
Apollo plugin's `didEncounterErrors` sees the original error — and throw a
`CustomException`, a `denial()` or a `GraphQLError` for a message meant for
the caller. Outside production, pass `false` or leave the argument out.

## Traps that throw nothing

### Every caller is anonymous behind the gateway

`useAuth({ trustedGateway })` reads no caller from a request that does not
carry the gateway's proof. The gateway is not sending the header — or sends
another secret — on its subgraph requests. Make it add
`x-gateway-secret: <secret>` (or your `header`) to every one, with the same
value the subgraph was given.

### `FORBIDDEN` from `@authenticated(type:)` for a caller who should pass

The caller's type is `context.ory.kind`, or `context.user.tokenType` without
Ory. Behind a gateway that writes no `tokenType` in the `user` it forwards,
every caller has no type, and every `type:` refuses them. Make the gateway
write it, or drop `type:` on those fields.

### A guarded field answers unguarded in the supergraph

A subgraph composed by federation drops a directive it was not told to keep.
Add `@composeDirective(name: "@permission")` and import the directive in the
subgraph's `@link`.

### `@authenticated(type:)` in a subgraph

Federation declares `@authenticated` without an argument, and a subgraph
imports that declaration. Keep it: `useAuthenticated` enforces it as "any
caller". A `type:` restriction is for a schema that declares `@authenticated`
through `SHARED_TYPE_DEFS` or `AUTHENTICATED_DIRECTIVE_SDL`.

### `OryForbidden` from `ory.requireAllowed` is a 500

`createMaskError` does not map `OryForbidden`: whether a refusal is a 404 or a
403 is the caller's decision. In a resolver, use `can` and throw the
`denial` you mean.
