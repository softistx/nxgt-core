# Troubleshooting `@nxgt/shared-graphql`

Each entry is headed by the message you see; the parts in `<angle brackets>`
vary. Messages thrown when the schema is built are `TypeError`s naming
`Type.field`, and stop the server from booting. The last section holds the
traps that throw nothing.

## When the schema is built

### `@permission on <Type.field>: `id` must be "args.<path>", "parent.<path>" or "source.<path>", got "<id>"`

The `id` argument (or a `@check` term's `id`) names no root. Prefix it:

```graphql
note(noteId: ID!): Note @permission(name: "view", type: "Note", id: "args.noteId")
```

### `@permission on <Type.field>: `id` reads "args.<name>", but the field declares <arguments>`

The path reads an argument the field does not have — usually the default
`args.id` on a field whose argument is named otherwise. graphql-js never puts
an undeclared argument on `args`, so every request would have failed. Name the
argument in `id`, or read the parent with `parent.<path>`.

### `@check on <Type.field>: an empty group admits EVERYONE — a conjunction over no terms is true`

`@check(permissions: [[]])`. An AND over nothing is true, so the field would
be open to every signed-in caller while looking guarded. Name a permission,
or remove the directive.

### `@check on <Type.field>: an empty permission requirement admits nobody — remove it, or name a permission`

`@check(permissions: [])`: an OR over nothing refuses everyone.

### `@permission on <Type.field>: unknown namespace "<type>" — known: <namespaces>`

You passed `namespaces` to `useKetoChecks` / `applyKetoChecks`, and the field
names one outside them — most often a typo. Keto would have answered `false`
for ever, without an error. Fix the name, or add the namespace to the list
when the OPL document gained it.

### `<Type.field>: @check / @permission on an interface field guards nothing — no resolver runs there. Put it on each implementing type's field`

A resolver runs on an object type's field, never on an interface's. Move the
directive to every implementing type:

```graphql
interface Node { id: ID! }
type Note implements Node {
	id: ID!
	body: String @permission(name: "view", type: "Note", id: "parent.id")
}
```

## When a request runs

### `<Type.field>: "<path>" resolved no object id`

The path was valid, but at request time it pointed at nothing — a nullable
argument nobody passed, an empty list, a parent field the parent resolver did
not load. It is a 500, never an allow. Make the argument required, or make
sure the parent object carries the field.

### `<Type.field>: no checker on the context — useKetoChecks(ory) is not registered`

The schema was transformed with `applyKetoChecks` but the plugin that puts the
per-request checker on the context is missing. Register
`useKetoChecks(ory)` after `useOryAuth(ory)`.

### `can(): no checker on the context — useKetoChecks(ory) is not registered`

The same, from `can`.

### `ory: keto is unavailable` with `SERVICE_UNAVAILABLE` and HTTP 503

Keto (or Kratos, Hydra — the name varies) did not answer. This is on
purpose: an outage is never turned into a denial or an anonymous caller. The
client can retry; `extensions.debugMessage` carries what the SDK saw.

### `Unexpected error.` with `INTERNAL_SERVER_ERROR` where a 404 or 403 was expected

`createMaskError` is not registered, so Yoga masks the `CustomException` a
denial throws as it masks any non-GraphQL error:

```ts
createYoga({ maskedErrors: { maskError: createMaskError(translate) } });
```

Under Apollo Server, the counterpart is `formatError: createFormatError(translate)`.

### `Unexpected error.` where a resolver's own message used to reach the client

Since this release `createMaskError` masks a plain `Error` a resolver threw,
as Yoga's default does — before, its message (a driver error, a host name)
reached the client. Throw a `CustomException` or a `GraphQLError` for a
message meant for the caller.

## Traps that throw nothing

### A guarded field answers unguarded in the supergraph

A subgraph composed by federation drops a directive it was not told to keep.
Add `@composeDirective(name: "@permission")` (and `"@check"` if used) and
import the directive in the subgraph's `@link`.

### `useAuth()` trusts the request body

`useAuth()` copies `user` and `token` from the GraphQL request's
`extensions`, which a client writes. It is safe only behind a gateway that
sets them and a network that stops callers from reaching the service
directly. An API that resolves its own callers uses `useOryAuth(ory)`.

### `OryForbidden` from `ory.requireAllowed` is a 500

`createMaskError` does not map `OryForbidden`: whether a refusal is a 404 or a
403 is the caller's decision. In a resolver, use `can` and throw the
`CustomException` you mean.
