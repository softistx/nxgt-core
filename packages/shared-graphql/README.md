# @nxgt/shared-graphql

The GraphQL layer: Yoga + Hono wiring, the federation subgraph builder, shared
scalars and directives, dataloaders, subscriptions over Redis, upload handling,
and the SDL every service merges into its own schema.

## Install

```bash
bun add @nxgt/shared-graphql
```

Public on npmjs; no token needed to install. Peers:

| Peer | Range | Why |
| --- | --- | --- |
| `graphql` | `^16.4.2 \|\| ^17.0.0` | one copy for your schema and this package's transforms; the suite runs on both majors |
| `@nxgt/ory-sdk` | `>=0.1.0` | `useOryAuth`, `useKetoChecks`, `can` |
| `stx-sdk` | `>=1.1.0` | `./security`'s policy types |
| `typescript` | `^6.0.3` | pinned across every `@nxgt/*` package — the set is unsatisfiable if one of them widens it |

The long version of each section below is in [`docs/`](./docs/README.md).

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-graphql` | server wiring, scalars, utils, context types, plugins |
| `@nxgt/shared-graphql/security` | `PolicyEvaluationService` / `evaluateFromRules` — wraps `@nxgt/security/policy` for a Yoga schema |

## The shared SDL ships in `graphql/`, not in `dist/`

`bun build` bundles code and nothing else, so the `.graphqls` files live in
their own published directory (`graphql/directives`, `graphql/scalars`,
`graphql/schema`). Point your codegen and your schema loader at
**`SHARED_SCHEMA_PATH`**, which this package resolves against its own root by
walking up to the nearest `package.json` — the bundle is `dist/index.js`, the
source is `src/utils/schema.utils.ts`, and no single relative path serves both.

```ts
import { fileURLToPath } from 'node:url';
import { loadTypeDefs, SHARED_SCHEMA_PATH } from '@nxgt/shared-graphql';

const typeDefs = loadTypeDefs(
	SHARED_SCHEMA_PATH,
	fileURLToPath(new URL('../**/*.graphqls', import.meta.url)),
);
```

```ts
// codegen.ts
import { SCALARS_MAPPING, SHARED_SCHEMA_PATH } from '@nxgt/shared-graphql';

schema: ['./src/**/*.graphqls', SHARED_SCHEMA_PATH],
```

A relative path into this package's `src/` will not work from an install — it
is not published, and it was not there in the first place.

`SHARED_TYPE_DEFS` is a string of the shared directives (`@authenticated`,
`@policy`, `@shareable`, `@link`) plus empty root types. `@permission` and
`@check` are not in it: they live in `graphql/directives/`, so a subgraph that
builds through `buildSubgraphSchema` and never loads `SHARED_TYPE_DEFS` still
sees them through `SHARED_SCHEMA_PATH`. For a schema assembled in code, the
same declarations ship as strings — `PERMISSION_DIRECTIVE_SDL`,
`CHECK_DIRECTIVE_SDL`, or both as `KETO_DIRECTIVES_SDL` — held equal to the
files by a spec.

```ts
import { KETO_DIRECTIVES_SDL } from '@nxgt/shared-graphql';

createSchema({ typeDefs: [KETO_DIRECTIVES_SDL, typeDefs], resolvers });
```

`buildSubgraphSchema` wraps Apollo's builder and prunes unused types.

## `@permission` — the permission a field requires

`@authenticated` asks whether anyone is calling. `@policy` asks whether they
*carry* an authority. Neither can ask what an Ory-native API needs to know:
**may this caller `view` `Note:n1`** — a question about one object, answered by
Keto. `@permission` asks it; `useKetoChecks(ory)` answers it.

```graphql
note(id: ID!): Note! @permission(name: "view", type: "Note")

updateNote(id: ID!, input: UpdateNoteInput!): Note!
	@permission(name: "view", type: "Note")
	@permission(name: "edit", type: "Note", onDeny: FORBIDDEN)

owner: Person @permission(name: "view", type: "Person", id: "parent.ownerId")
```

```ts
plugins: [useOryAuth(ory), useKetoChecks(ory, { namespaces: ['Note', 'Person'] }), useGenericAuth({ … })]
```

- `name` is the permit, `type` the Keto namespace, `id` where the object id
  is read: `args.<path>` (default `args.id`) or `parent.<path>`. A **list**
  value requires the permit on every element.
- **Repeated, they are AND**, in declaration order, each with its own
  `onDeny`: a stranger fails `view` and gets `NOT_FOUND` (the default), so an
  id cannot be probed; a viewer passes it, fails `edit`, and gets `FORBIDDEN`.
- `message:` sets the i18n key a denial carries (shared `errors.not-found` /
  `errors.insufficient-permissions` otherwise). Word it like the service
  layer that guards the same object, or the wording tells a caller which
  layer refused.
- An OR belongs in the Keto model — a permit that unions two relations — not
  in the schema.

**Refused when the schema is built**, as a `TypeError` naming `Type.field`: a
path naming no root, an `args.<name>` the field does not declare, a namespace
outside `namespaces` (when you pass them), and a guard on an interface field,
where no resolver runs. On a `@check`, the undeclared argument and the
interface field are logged as warnings instead, since 2.x booted with them;
the next major refuses them there too.

`@permission` is read only when its declaration has `name` and `type` — a
schema with its own `@permission` of another shape keeps it. Loading this
package's `graphql/` next to such a declaration merges the two, though: see
troubleshooting.

**An outage is never a denial.** A Keto failure throws `OryUnavailable`, which
`createMaskError` answers `503 SERVICE_UNAVAILABLE`.

Every question goes through a per-request memo: distinct questions are
batched into one `POST /relation-tuples/batch/check`, identical ones asked
once, a failed batch not remembered.

### `@check`, the list-of-lists form — deprecated

`@check(permissions: [[{ namespace, permit, id }]], onDeny, message)` keeps
working, is validated the same way, and is evaluated in declaration order with
`@permission` on the same field. Its outer list is OR, its inner list AND. Write
`@permission` in a new schema; `@check` is planned for removal in a major.

```graphql
note(id: ID!): Note! @check(permissions: [[{ namespace: "Note", permit: "view" }]])
```

### From a resolver: `requireUser` and `can`

```ts
import { can, type OryGraphQLContext, requireUser } from '@nxgt/shared-graphql';
import { CustomException } from '@nxgt/shared-exceptions';

async function archive(_: unknown, { id }: { id: string }, ctx: OryGraphQLContext) {
	const user = requireUser(ctx); // UNAUTHENTICATED (401) when nobody is calling
	if (!(await can(ctx, { name: 'edit', type: 'Note', id }))) {
		throw CustomException.forbidden({ message: 'notes.errors.read-only' });
	}
	return notes.archive(id, user.sub);
}
```

`can` answers Keto's `true` or `false` through the same memo as the
directives; an outage throws, never answers `false`.

### What it does not cover, on purpose

A field that answers a **list** the caller is entitled to. "Which notes may I
see" is not a check — it is a Keto query folded into the database filter
before the read. A directive there would have to fetch everything and filter
after, which makes `totalCount` and the cursors lie.

### A shipped directive is not a composed directive

Shipping the SDL is enough for a standalone Yoga schema. It is **not** enough
for a subgraph that federation composes: that subgraph needs
`@composeDirective(name: "@permission")` (or `"@check"`) and the directive in
its own `@link` import list. Without them the composition drops it silently —
the supergraph SDL comes out valid, the field loses its guard, and nothing
fails.

## Errors

```ts
createYoga({ maskedErrors: { maskError: createMaskError(translate) } });
new ApolloServer({ formatError: createFormatError(translate) });
```

Under Yoga, `createMaskError` turns a `CustomException` into a `GraphQLError`
with `extensions { code, http { status } }` — `UNAUTHENTICATED` 401,
`FORBIDDEN` 403, `NOT_FOUND` 404 — and its translated message; `OryUnavailable`
into `SERVICE_UNAVAILABLE` 503, recognised even from a second copy of
`@nxgt/ory-sdk`; and a plain `Error` a resolver threw into the mask message, as
Yoga's default does.

Under Apollo, `createFormatError` sets the `code` and the translated message
(and `SERVICE_UNAVAILABLE` for an outage, with `http.status` in `extensions`
only — `formatError` cannot change the transport status). It masks nothing
Apollo would not.

## Plugins and context

| Export | What it does |
| --- | --- |
| `useOryAuth(ory)` | Yoga plugin: resolve the caller through Kratos or Hydra, set `user`, `claims`, `ory` |
| `useKetoChecks(ory, options?)` | Yoga plugin: the per-request Keto memo, and the `@permission` / `@check` transform |
| `applyKetoChecks(schema, options?)` | the same transform on an already-built schema |
| `requireUser(ctx)`, `can(ctx, question)` | the caller or 401; Keto's answer through the memo |
| `useAuth()` | Yoga plugin: copy `user` and `token` from the request's `extensions` — trust it only behind a gateway that sets them |
| `extractJwtPlugin` | Apollo plugin: copy `request.extensions.payload` onto `context.jwt` |

`GraphQLBaseContext.user` is `TokenPrincipal` — the caller as the access token
describes them (`sub`, `uid`, `scope`). It is not `Principal`, which is the
header-derived shape used by the REST services.

`createYogaHono` / `honoYoga` (from this package's integrations) mount Yoga on
Hono. `sandboxExpolorer` serves Apollo Sandbox. Subscriptions go over Redis
(`graphql-subscriptions` is re-exported). `DataLoader` is re-exported so a
subgraph does not take a second copy.

Uploads: the `Upload` scalar lives in this package; `graphql/scalars` ships the
SDL.

## Things that bite

- **`@permission` on a list field is the wrong tool.** Filter before the read.
- **`useAuth()` reads the request body's `extensions`.** A client that can
  reach the service directly can set them. Put the service behind the gateway
  that writes them, or resolve the caller with `useOryAuth(ory)`.
- **Do not import `graphql-subscriptions` from `graphql-subscriptions`.** Take
  it from this package, same reason mongoose comes from `@nxgt/shared-mongo`.
- **The sandbox helper is spelled `sandboxExpolorer`.** That is the export
  name. A corrected spelling is a breaking change, not a typo fix in the
  consumer.
- **`stx-sdk` is required.** Unlike `@nxgt/security`, this package does not
  mark it optional.
