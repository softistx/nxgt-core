# Permissions: `@permission`, `useKetoChecks`

An Ory-native API asks Keto one question per object: **may this caller
`view` `Note:n1`**. This page is how a schema asks it, what answers it, and
what happens when the answer cannot be had.

## Wiring

```ts
import { createOry } from '@nxgt/ory-sdk';
import {
	createMaskError,
	type OryGraphQLContext,
	SHARED_SCHEMA_PATH,
	loadTypeDefs,
	useKetoChecks,
	useOryAuth,
} from '@nxgt/shared-graphql';
import { createSchema, createYoga } from 'graphql-yoga';

const ory = createOry({ /* … */ });

const yoga = createYoga<{}, OryGraphQLContext>({
	schema: createSchema({
		typeDefs: loadTypeDefs(SHARED_SCHEMA_PATH, './src/**/*.graphqls'),
		resolvers,
	}),
	plugins: [
		useOryAuth(ory), // puts `ory`, `user`, `claims`, `token` on the context
		useKetoChecks(ory, { namespaces: ['Note', 'Folder'] }),
	],
	maskedErrors: { maskError: createMaskError(translate) },
});
```

`useOryAuth` is needed: a guarded field reads `ory.subject`, which it puts on
the context — without it every guarded field answers `UNAUTHENTICATED`.
`createMaskError` is optional for the denials, which carry their own status,
and is what translates their message with your `translate` and turns an
outage into a 503 — see [errors](./errors.md).

A schema assembled in code, with no `SHARED_SCHEMA_PATH`, takes the
declaration as a string:

```ts
import { PERMISSION_DIRECTIVE_SDL } from '@nxgt/shared-graphql';

createSchema({ typeDefs: [PERMISSION_DIRECTIVE_SDL, typeDefs], resolvers });
```

It equals `graphql/directives/permission.graphqls` — a spec parses and prints
both. `KETO_DIRECTIVES_SDL` is the same string.

## `@permission`

```graphql
directive @permission(
	name: String!
	type: String!
	id: String
	onDeny: PermissionDenial! = NOT_FOUND
	message: String
) repeatable on FIELD_DEFINITION
```

| Argument | Meaning |
| --- | --- |
| `name` | the permit asked of Keto — `view`, `edit`; a plain relation works too |
| `type` | the Keto namespace — `Note` |
| `id` | where the object id is read: `args.<path>` or `parent.<path>`; `args.id` when omitted |
| `onDeny` | `NOT_FOUND` (default) or `FORBIDDEN` |
| `message` | the i18n key the denial carries |

### The 404-then-403 ladder

Repeated `@permission`s are AND, evaluated **in declaration order**, and each
answers its own `onDeny`:

```graphql
updateNote(id: ID!, input: UpdateNoteInput!): Note!
	@permission(name: "view", type: "Note")
	@permission(name: "edit", type: "Note", onDeny: FORBIDDEN)
```

| Caller holds | Answer |
| --- | --- |
| nothing | `NOT_FOUND` (404) — the same as an id that never existed, so ids cannot be probed |
| `view` | `FORBIDDEN` (403) — they can already see it, so "you may not change it" is honest |
| `view` and `edit` | the resolver runs |

An anonymous caller is `UNAUTHENTICATED` (401) before Keto is asked anything.

### Where the id comes from

```graphql
note(id: ID!): Note @permission(name: "view", type: "Note")
noteByKey(key: ID!): Note @permission(name: "view", type: "Note", id: "args.key")
deleteNotes(ids: [ID!]!): Boolean @permission(name: "delete", type: "Note", id: "args.ids")

type Note {
	ownerId: ID!
	owner: Person @permission(name: "view", type: "Person", id: "parent.ownerId")
}
```

A **list** requires the permit on every element, and stops at the first
refusal. `source.<path>` is accepted as the same root as `parent.<path>`.

A path that resolves no id at request time — a nullable argument nobody
passed, a parent field that was not loaded — is a wiring error (500), never an
allow.

### Or, in the model

There is no OR between `@permission`s. When a field is open to owners *or*
editors, say so in the Keto model — a permit that unions the two relations —
and ask that permit.

### Wording a refusal

`message` defaults to the shared `errors.not-found` /
`errors.insufficient-permissions`. Set it whenever the service behind the field
refuses the same object with a domain message:

```graphql
note(id: ID!): Note
	@permission(name: "view", type: "Note", message: "notes.errors.not-found")
```

Two layers guard these fields — the directive and the service's own access
check — and if they word the same 404 differently, the wording tells a caller
which one refused: a generic message means "you may not", a domain one "it is
gone". That is the distinction `NOT_FOUND` exists to hide.

## `@check` — removed in 3.0

The list-of-lists form is gone. Rewrite each term as a `@permission`, and move
an OR into the Keto model — [the migration guide](./migrating-to-3.md#2-check-is-removed)
has the before and after. A `@check` left in a schema does not boot: see
[troubleshooting](../troubleshooting.md).

## Refused at build

`applyKetoChecks` — which `useKetoChecks` runs on every schema change — reads
every `@permission` when the schema is built, and throws a `TypeError` naming
`Type.field` for:

| Mistake | Message starts |
| --- | --- |
| a path naming no root | ``@permission on Query.note: `id` must be "args.<path>", …`` |
| an argument the field does not declare | ``… `id` reads "args.id", but the field declares noteId`` |
| an empty `name` or `type` | ``… every term needs `namespace`, `permit` and `id` …`` |
| a namespace outside `namespaces` | `… unknown namespace "Noet" — known: Note, Folder` |
| a guard on an interface field | `Node.id: @permission on an interface field guards nothing …` |
| a `@check` of 2.x's shape | `@check on Query.note: @check was removed in @nxgt/shared-graphql 3.0 …` |

`namespaces` is optional. Without it a namespace is taken on trust, and a
misspelt one answers `false` for ever — Keto does not error on a namespace it
does not know. Pass the namespaces of your OPL document to make that a boot
failure.

`applyKetoChecks` leaves a field it already guarded alone, so a field is never
wrapped twice, and a field it has not — the other half of a merged schema —
is guarded when it runs again — as is a field whose resolver was replaced
since (`addResolversToSchema`, a merge with resolvers).

On a subscription, a `@permission` whose `id` reads `args.*` is asked before
`subscribe`, so a refused subscription opens no stream. One that reads
`parent.*` has no event to read yet: it is asked of each event instead, and a
refused event answers its denial while the stream stays open.

## From a resolver

```ts
import { can, denial, type OryGraphQLContext, requireUser } from '@nxgt/shared-graphql';
import { ErrorCode } from '@nxgt/shared-exceptions';

const resolvers = {
	Mutation: {
		archive: async (_: unknown, { id }: { id: string }, ctx: OryGraphQLContext) => {
			const user = requireUser(ctx);
			if (!(await can(ctx, { name: 'edit', type: 'Note', id }))) {
				throw denial(ErrorCode.Forbidden, 'notes.errors.read-only');
			}
			return notes.archive(id, user.sub);
		},
	},
};
```

- `requireUser(ctx)` returns `ctx.user`, or throws an `UNAUTHENTICATED`
  denial (401).
- `can(ctx, { name, type, id })` returns Keto's answer. It throws
  `UNAUTHENTICATED` with no caller, names the missing plugin without
  `useKetoChecks`, and lets `OryUnavailable` through on an outage — it never
  answers `false` for a question it could not ask.

## The per-request memo

`useKetoChecks` puts one `ketoChecks` function on each request's context. It
**batches** the distinct questions of one tick into a single
`POST /relation-tuples/batch/check` and **memoises** answers for the request.
A field guarded by `@permission(view)` and a service that asks the same
question through `can` pay for one round trip between them.

A batch that failed is not remembered: every question in it rejects with the
outage, and the next ask goes back to Keto.

## An outage is not a no

`@nxgt/ory-sdk` throws `OryUnavailable` when Keto cannot answer. Nothing in
this package catches it as a denial: the directive, `can` and the memo all
let it through, and `createMaskError` / `createFormatError` answer it
`SERVICE_UNAVAILABLE` with HTTP 503. See [errors](./errors.md).

## Not a check: lists

"Which notes may I see" is a Keto query folded into the database filter before
the read, not a directive. A directive on a list field would have to fetch
everything and filter after, which makes `totalCount` and the cursors lie.
