# Permissions: `@permission`, `@check`, `useKetoChecks`

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

Both are needed: a guarded field reads `ory.subject`, which `useOryAuth` puts
on the context — without it every guarded field answers `UNAUTHENTICATED`. `createMaskError` is what turns a denial into a 404/403 and an outage
into a 503 — without it Yoga answers every one of them as an opaque 500.

A schema assembled in code, with no `SHARED_SCHEMA_PATH`, takes the
declarations as a string:

```ts
import { KETO_DIRECTIVES_SDL } from '@nxgt/shared-graphql';

createSchema({ typeDefs: [KETO_DIRECTIVES_SDL, typeDefs], resolvers });
```

`PERMISSION_DIRECTIVE_SDL` and `CHECK_DIRECTIVE_SDL` are the two halves. Each
equals its file in `graphql/directives/` — a spec parses and prints both.

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
| nothing | `NOT_FOUND` — the same as an id that never existed, so ids cannot be probed |
| `view` | `FORBIDDEN` — they can already see it, so "you may not change it" is honest |
| `view` and `edit` | the resolver runs |

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

## `@check` — deprecated

The list-of-lists form. It keeps working, and is validated and evaluated
exactly like `@permission` — in declaration order with it, on the same field:

```graphql
note(id: ID!): Note
	@check(permissions: [[{ namespace: "Note", permit: "view" }]])

either(id: ID!): Note
	@check(permissions: [
		[{ namespace: "Note", permit: "a" }, { namespace: "Note", permit: "b" }],
		[{ namespace: "Note", permit: "c" }]
	])
```

The outer list is OR, the inner list AND: `[[A, B], [C]]` reads
"(A and B) or C". Moving a field to `@permission` one directive at a time
keeps its ladder, since the order is read across both names:

```graphql
updateNote(id: ID!, input: UpdateNoteInput!): Note!
	@check(permissions: [[{ namespace: "Note", permit: "view" }]])
	@permission(name: "edit", type: "Note", onDeny: FORBIDDEN)
```

A field whose `@check` really needs an OR is the one to move into the Keto
model first.

## Refused at build

`applyKetoChecks` — which `useKetoChecks` runs on every schema change — reads
every requirement when the schema is built, and throws a `TypeError` naming
`Type.field` for:

| Mistake | Message starts |
| --- | --- |
| a path naming no root | ``@permission on Query.note: `id` must be "args.<path>", …`` |
| an argument the field does not declare | ``… `id` reads "args.id", but the field declares noteId`` |
| an empty requirement or group (`@check`) | `… an empty group admits EVERYONE …` |
| a namespace outside `namespaces` | `… unknown namespace "Noet" — known: Note, Folder` |
| a guard on an interface field | `Node.id: @check / @permission on an interface field guards nothing …` |

On a `@check` — which 2.x booted with them — the undeclared argument and the
interface field are logged (`logger.warn` from `@nxgt/shared-logging`) instead
of thrown, ending `— @check still boots with this; the next major refuses it,
as @permission does`. Fix them now: the field they name answers 500 on every
request, or is not guarded at all.

`namespaces` is optional. Without it a namespace is taken on trust, and a
misspelt one answers `false` for ever — Keto does not error on a namespace it
does not know. Pass the namespaces of your OPL document to make that a boot
failure.

## From a resolver

```ts
import { can, type OryGraphQLContext, requireUser } from '@nxgt/shared-graphql';

const resolvers = {
	Mutation: {
		archive: async (_: unknown, { id }: { id: string }, ctx: OryGraphQLContext) => {
			const user = requireUser(ctx);
			if (!(await can(ctx, { name: 'edit', type: 'Note', id }))) {
				throw CustomException.forbidden({ message: 'notes.errors.read-only' });
			}
			return notes.archive(id, user.sub);
		},
	},
};
```

- `requireUser(ctx)` returns `ctx.user`, or throws `UNAUTHENTICATED` (401).
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
