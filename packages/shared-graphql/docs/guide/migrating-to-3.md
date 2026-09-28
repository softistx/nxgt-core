# Migrating to 3.0

`@nxgt/shared-graphql` 3.0 is a major release. Most of it is the removals and
renames 2.x announced, plus one security fix that changes how the caller is
read. Each section below is one break: what changed, why, and the code before
and after.

| # | Break | You are affected if you… |
| --- | --- | --- |
| 1 | [`useAuth()` and `extractJwtPlugin` need a trusted gateway](#1-useauth-and-extractjwtplugin-need-a-trusted-gateway) | use either |
| 2 | [`@check` is removed](#2-check-is-removed) | write `@check`, or import `CHECK_DIRECTIVE_SDL` / `readChecks` / `readRequirements` |
| 3 | [`@authenticated` takes `type:`, and this package enforces it](#3-authenticated-takes-type) | declare `@authenticated` yourself, or load `SHARED_TYPE_DEFS` |
| 4 | [Five dependencies are gone](#4-five-dependencies-are-gone) | import one of them without declaring it |
| 5 | [`@nxgt/ory-sdk` is peered `>=0.1.0 <1`](#5-nxgtory-sdk-is-peered-010-1) | are on an `@nxgt/ory-sdk` 1.x (none is published) |
| 6 | [`graphql` is peered `^16.9.0 \|\| ^17.0.0`](#6-graphql-is-peered-1690--1700) | are on graphql 16.4 to 16.8 |
| 7 | [`sandboxExpolorer` is `sandboxExplorer`](#7-sandboxexpolorer-is-sandboxexplorer) | import it |
| 8 | [A denial is a `GraphQLError`](#8-a-denial-is-a-graphqlerror) | catch a denial as a `CustomException`, or read its `errorCode` |

## 1. `useAuth()` and `extractJwtPlugin` need a trusted gateway

**Why.** Both copied the caller from the GraphQL request's `extensions` —
`user` and `token` for `useAuth()`, `payload` for `extractJwtPlugin`. That is
part of the request body, and any client that reaches the service writes it:

```json
{ "query": "{ me { id } }", "extensions": { "user": { "sub": "someone-else" } } }
```

In 2.x that request was answered as `someone-else`. In 3.0 the caller is read
from `extensions` only for a request that proves it came from your gateway.

**Before**

```ts
createYoga({ plugins: [useAuth()] });
new ApolloServer({ plugins: [extractJwtPlugin] });
```

**After**

```ts
import { extractJwtPlugin, gatewaySecret, useAuth } from '@nxgt/shared-graphql';

const trustedGateway = gatewaySecret({ secret: process.env.GATEWAY_SECRET! });

createYoga({ plugins: [useAuth({ trustedGateway })] });
new ApolloServer({ plugins: [extractJwtPlugin({ trustedGateway })] });
```

Then make the gateway send the secret on every subgraph request, in the
`x-gateway-secret` header (or the one you name with `header`). A Hive Gateway,
for example:

```ts
defineConfig({
	propagateHeaders: {
		fromClientToSubgraphs: () => ({ 'x-gateway-secret': process.env.GATEWAY_SECRET }),
	},
});
```

- A request without the header, or with a wrong one, keeps the context
  without a caller: `user`, `token` and `jwt` are left as they were.
- `gatewaySecret` refuses, when it is built, a secret shorter than 16
  characters — an unset variable stops the server instead of trusting an
  empty header. It compares in constant time.
- `trustedGateway` can be any `(headers) => boolean | Promise<boolean>`, for a
  proof other than a shared secret (an mTLS header your proxy sets, say).
- Called without a `trustedGateway`, both throw a `TypeError` when the server
  starts:
  ``useAuth(): name the gateway allowed to set the caller — …``.
- `extractJwtPlugin` is now a function, and no longer logs the payload.

An API that authenticates its own callers — a Kratos session, a Hydra token —
does not need a gateway at all: use `useOryAuth(ory)`, which verifies the
credential server-side.

## 2. `@check` is removed

**Why.** `@permission` replaced it in 2.1, and 3.0 drops the list-of-lists
form: one Keto question per directive, AND when repeated, and OR in the Keto
model.

**Before**

```graphql
note(id: ID!): Note @check(permissions: [[{ namespace: "Note", permit: "view" }]])

updateNote(id: ID!): Note
	@check(permissions: [[{ namespace: "Note", permit: "view" }]])
	@check(permissions: [[{ namespace: "Note", permit: "edit" }]], onDeny: FORBIDDEN)

owner: Person @check(permissions: [[{ namespace: "Person", permit: "view", id: "parent.ownerId" }]])
```

**After**

```graphql
note(id: ID!): Note @permission(name: "view", type: "Note")

updateNote(id: ID!): Note
	@permission(name: "view", type: "Note")
	@permission(name: "edit", type: "Note", onDeny: FORBIDDEN)

owner: Person @permission(name: "view", type: "Person", id: "parent.ownerId")
```

`namespace` is `type`, `permit` is `name`; `id`, `onDeny` and `message` keep
their meaning. A term group with two terms (`[[A, B]]`, an AND) becomes two
`@permission`s. A requirement with two groups (`[[A], [B]]`, an OR) has no
`@permission` spelling: add a permit to the Keto model that unions the two
relations, and ask that one.

**In code:**

| 2.x | 3.0 |
| --- | --- |
| `CHECK_DIRECTIVE_SDL` | gone — `PERMISSION_DIRECTIVE_SDL` |
| `KETO_DIRECTIVES_SDL` | still exported, now `@permission` alone |
| `readChecks`, `readRequirements` | gone — `readPermissions` |
| `CheckArgs`, `CheckDenial` | `FieldPermission`, `PermissionDenial` |
| `graphql/directives/check.graphqls` | no longer shipped |

**What 2.x only warned about now stops the server.** An `args.<name>` the
field does not declare, and a guard on an interface field, were logged as
warnings on a `@check`. As `@permission`s they are `TypeError`s naming the
field, when the schema is built.

**A `@check` left behind does not boot.** Without its declaration, graphql
refuses it (`Unknown directive "@check"`). With a declaration of 2.x's shape
copied into your schema, `useKetoChecks` refuses it:

```
@check on Query.note: @check was removed in @nxgt/shared-graphql 3.0 — write one @permission(name: "<permit>", type: "<namespace>") per term, and move an OR into the Keto model
```

A `@check` directive of another shape (without `permissions`) is yours, and is
left alone.

## 3. `@authenticated` takes `type:`

**Why.** A field meant for a machine client could not refuse a person's
session. `@authenticated(type: [String!])` names the kinds of caller a field
admits, and `useAuthenticated()` enforces it.

**Before** — `@authenticated` was declared, and enforced by an app's own
`useGenericAuth`:

```ts
createYoga({ plugins: [useOryAuth(ory), useGenericAuth({ mode: 'protect-granular', resolveUserFn })] });
```

**After**

```graphql
me: User @authenticated
webhooks: [Webhook!]! @authenticated(type: ["token"])
```

```ts
import { useAuthenticated, useOryAuth } from '@nxgt/shared-graphql';

createYoga({ plugins: [useOryAuth(ory), useAuthenticated()] });
```

- The type is Ory's `kind` — `session` or `token` — or `user.tokenType` when
  no Ory principal is on the context. `useAuthenticated({ types: [...] })`
  names other values; a `type` outside them is refused at build.
- An anonymous caller is `UNAUTHENTICATED` (401), a caller of another type
  `FORBIDDEN` (403).
- `SHARED_TYPE_DEFS` now declares `@authenticated(type: [String!])`. If you
  declare `@authenticated` yourself, add the argument or drop your
  declaration; `AUTHENTICATED_DIRECTIVE_SDL` is the declaration as a string.
- **In a federation subgraph**, keep federation's own `@authenticated`, which
  takes no argument: import it in `@link` as before. `useAuthenticated()`
  reads that shape as "any caller", so the directive is enforced there too.
  `FEDERATION_DIRECTIVES` keeps federation's shape for the same reason.

`useGenericAuth` keeps working beside it if you still need its other modes.
Declare `@envelop/generic-auth` yourself — see the next section.

## 4. Five dependencies are gone

**Why.** Nothing in this package imported them:
`@graphql-hive/gateway`, `@envelop/generic-auth`,
`@envelop/extended-validation`, `@hono/zod-validator`, `zod`.

An app that imported one of them without declaring it got it through this
package, and now gets `Cannot find module`. Declare what you use:

```diff
 "dependencies": {
+	"@envelop/generic-auth": "^11.1.1",
 	"@nxgt/shared-graphql": "^3.0.0"
 }
```

## 5. `@nxgt/ory-sdk` is peered `>=0.1.0 <1`

**Why.** An open range admitted a breaking SDK major the day it was
published, untested. Every published version (0.1.x) is still admitted;
nothing changes for an install today. `@nxgt/security` and
`@nxgt/shared-hono` take the same ceiling.

## 6. `graphql` is peered `^16.9.0 || ^17.0.0`

**Why.** The floor was 16.4.2, which nothing tested. The suite runs on a
graphql 16 above 16.9 and on graphql 17. On graphql 16.4 to 16.8, upgrade:

```sh
bun add graphql@^16.9.0
```

## 7. `sandboxExpolorer` is `sandboxExplorer`

**Before**

```ts
import { sandboxExpolorer } from '@nxgt/shared-graphql';
app.get('/sandbox', sandboxExpolorer({ port: 4000 }));
```

**After**

```ts
import { sandboxExplorer } from '@nxgt/shared-graphql';
app.get('/sandbox', sandboxExplorer({ port: 4000 }));
```

No alias is kept. `createYogaHono` uses the new name for you.

## 8. A denial is a `GraphQLError`

**Why.** `@permission`, `requireUser` and `can` threw a `CustomException`,
which Yoga masks as a 500 unless `createMaskError` is registered. They now
throw `denial(code, message?)`: a `GraphQLError` carrying
`extensions { code, http { status } }`, so any server answers 401, 403 or 404.
`@authenticated` throws the same.

What a client receives through `createMaskError` or `createFormatError` does
not change: the same code, status and translated message.

**Before** — code that caught a refusal:

```ts
try {
	requireUser(ctx);
} catch (error) {
	if (error instanceof CustomException && error.errorCode === ErrorCode.Unauthenticated) { … }
}
```

**After**

```ts
import { GraphQLError } from 'graphql';

try {
	requireUser(ctx);
} catch (error) {
	if (error instanceof GraphQLError && error.extensions.code === 'UNAUTHENTICATED') { … }
}
```

Without `createMaskError`, the message is the shared key translated with
`@nxgt/i18n`'s own resources (`Could not find the requested resource.`), in
the request's language when one is known. A custom `message:` key those
resources do not hold reaches the client as the key: register
`createMaskError(translate)` to translate it with yours. `denial` and
`denialMessageKey` are exported for a resolver or a mask of your own.
