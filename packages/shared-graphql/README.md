# @nxgt/shared-graphql

The GraphQL layer: Yoga + Hono wiring, the federation subgraph builder, shared
scalars and directives, dataloaders, subscriptions over Redis, upload handling,
and the SDL every service merges into its own schema.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-graphql` | server wiring, scalars, utils, context types |
| `@nxgt/shared-graphql/security` | the `@policy` directive and its validation |

## The shared SDL ships in `graphql/`, not in `dist/`

`bun build` bundles code and nothing else, so the `.graphqls` files live in
their own published directory. Point your codegen and your schema loader at
**`SHARED_SCHEMA_PATH`**, which this package resolves against its own root:

```ts
import { loadTypeDefs, SCALAR_RESOLVERS, SHARED_SCHEMA_PATH } from '@nxgt/shared-graphql';

const typeDefs = loadTypeDefs(SHARED_SCHEMA_PATH, join(__dirname, '../**/*.graphqls'));
```

```ts
// codegen.ts
import { SCALARS_MAPPING, SHARED_SCHEMA_PATH } from '@nxgt/shared-graphql';

schema: ['./src/**/*.graphqls', SHARED_SCHEMA_PATH],
```

A relative path into this package's `src/` will not work from an install — it
is not published, and it was not there in the first place.

## `@check` — the permission a field requires

`@authenticated` asks whether anyone is calling. `@policy` asks whether they
*carry* an authority. Neither can ask what an Ory-native API needs to know:
**may this caller `view` `Note:n1`** — a question about one object, answered by
Keto.

`@check` asks it. The declaration ships in `graphql/directives/check.graphqls`,
so any schema built from `SHARED_SCHEMA_PATH` already has it; `useKetoChecks(ory)`
is what answers it.

```graphql
note(id: ID!): Note!
	@check(permissions: [[{ namespace: "Note", permit: "view" }]])

updateNote(id: ID!, input: UpdateNoteInput!): Note!
	@check(permissions: [[{ namespace: "Note", permit: "view" }]])
	@check(permissions: [[{ namespace: "Note", permit: "edit" }]], onDeny: FORBIDDEN)
```

```ts
plugins: [useOryAuth(ory), useKetoChecks(ory), useGenericAuth({ … })]
```

`permissions` is disjunctive normal form — **outer list OR, inner list AND**,
the same shape `@policy(policies: [["ADMIN"]])` uses. `[[A, B], [C]]` reads
"(A and B) or C", and evaluation is short-circuit in both directions, so the
order written is the order Keto is billed for.

`id` defaults to `args.id` and may be any `args.<path>` or `source.<path>`. A
value that turns out to be a **list** requires the permit on every element —
that is what `deleteNotes(ids: [ID!]!)` means.

**The directive is repeatable, and that is how 404 and 403 stay distinct.**
Checks run in declaration order with their own `onDeny`: a stranger fails the
`view` check and gets `NOT_FOUND`, so an id cannot be probed; a viewer passes
it, fails `edit`, and gets `FORBIDDEN`, which is honest because they already
know the object exists.

### What it does not cover, on purpose

A field that answers a **list** the caller is entitled to. "Which notes may I
see" is not a check — it is a Keto query (`heldBy(subject)`) folded into the
database filter before the read. A directive there would have to fetch
everything and filter after, which makes `totalCount` and the cursors lie.
Those fields keep their access layer.

That access layer stays anyway, and costs nothing: `useKetoChecks` puts a
per-request loader on the context that **batches** distinct questions into one
`POST /relation-tuples/batch/check` and **memoises** identical ones. A field
guarded by `@check(view)` and a service that then asks the same question pay
for one round trip between them.

Two mistakes are refused when the schema is built, not when a request arrives:
an `id` naming neither root, and `permissions: [[]]` — a conjunction over no
terms is vacuously true, so it would admit everyone while looking guarded.

A Keto outage is never a denial: `OryUnavailable` travels up to
`createMaskError`, which answers 503.

## The context is a `TokenPrincipal`

`GraphQLBaseContext.user` is `TokenPrincipal` — the caller as the access token
describes them (`sub`, `uid`, `scope`). It is not `Principal`, which is the
header-derived shape used by the REST services.

`stx-sdk` is a peer, public on npmjs.

## Install

```bash
bun add @nxgt/shared-graphql
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
