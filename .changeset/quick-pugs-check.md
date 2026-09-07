---
'@nxgt/shared-graphql': minor
'@nxgt/shared-hono': minor
---

Let a schema and a route say which Keto permission they require.

An Ory-native API knows two things about a caller and can express only one of
them. `@authenticated` and a rules file's `authenticated: true` ask whether
anyone is calling; nothing asks **may this caller `view` `Note:n1`** — a
question about one object, which is the only kind Keto answers. So that
question lived in prose: "Needs `edit`", "NOT_FOUND unless the caller holds
`view`", written in a docstring or a comment, true until it was not.

Two integrations of one grammar now say it where it is read:

```graphql
note(id: ID!): Note!
	@check(permissions: [[{ namespace: "Note", permit: "view" }]])
```

```ts
app.get('/:id',
  ketoCheck([[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }]]),
  handler);
```

`permissions` is disjunctive normal form — outer list OR, inner list AND — the
same shape `@policy(policies: [["ADMIN"]])` already uses. Both are repeatable,
and evaluated in declaration order with their own `onDeny`, which is how a
denial stays a **404 for a stranger** (an id cannot be probed) and a **403 for
a viewer** (who already knows the object exists). The evaluator itself is
`stx-sdk/ory`'s, so the two cannot drift.

`@nxgt/shared-graphql` adds `useKetoChecks(ory)`, `applyKetoChecks(schema)` and
the SDL in `graphql/directives/check.graphqls` — shipped, so any schema built
from `SHARED_SCHEMA_PATH` already declares `@check`.

`@nxgt/shared-hono` adds `ketoCheck()`, `useOry()` and `requireAuthenticated()`
— the last being everything a rules file said about an Ory-native API, since
`oryAuth()` lets an anonymous caller through on purpose.

Both put a **per-request loader** on the context that batches distinct
questions into one `POST /relation-tuples/batch/check` and memoises identical
ones. So the access layer that already asks Keto keeps asking, and the second
question costs nothing.

Nothing changes for a consumer that does not use them. One that does needs
`stx-sdk` **1.1.0**, where the grammar and `ory.checkMany` live: the peer range
moved to `>=1.1.0`.

Neither covers a field or route that answers a **list** the caller is entitled
to. That is not a check but a Keto query folded into the database filter before
the read, and filtering after would make `totalCount` and the cursors lie.
