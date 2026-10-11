# @nxgt/shared-graphql

The GraphQL layer: Yoga + Hono wiring, the federation subgraph builder, shared
scalars and directives, dataloaders, subscriptions over Redis, upload handling,
and the SDL every service merges into its own schema.

**Upgrading from 2.x?** Read [Migrating to 3.0](./docs/guide/migrating-to-3.md)
— the caller is no longer read from a request body a client writes, `@check`
is gone, and denials are `GraphQLError`s.

## Install

```bash
bun add @nxgt/shared-graphql
```

Public on npmjs; no token needed to install. Peers:

| Peer | Range | Why |
| --- | --- | --- |
| `graphql` | `^16.9.0 \|\| ^17.0.0` | one copy for your schema and this package's transforms; the suite runs on both majors |
| `@nxgt/ory-sdk` | `>=0.1.0 <1` | `useOryAuth`, `useKetoChecks`, `can`; a 1.x is admitted once it is tested |
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

`SHARED_TYPE_DEFS` is a string of the shared directives
(`@authenticated(type:)`, `@policy`, `@shareable`, `@link`) plus empty root
types. `@permission` is not in it: it lives in `graphql/directives/`, so a
subgraph that builds through `buildSubgraphSchema` and never loads
`SHARED_TYPE_DEFS` still sees it through `SHARED_SCHEMA_PATH`. For a schema
assembled in code, the declarations ship as strings —
`PERMISSION_DIRECTIVE_SDL` (also exported as `KETO_DIRECTIVES_SDL`), held
equal to its file by a spec, and `AUTHENTICATED_DIRECTIVE_SDL`, which has no
file: it lives in `SHARED_TYPE_DEFS` and in this string only.

```ts
import { AUTHENTICATED_DIRECTIVE_SDL, PERMISSION_DIRECTIVE_SDL } from '@nxgt/shared-graphql';

createSchema({ typeDefs: [AUTHENTICATED_DIRECTIVE_SDL, PERMISSION_DIRECTIVE_SDL, typeDefs], resolvers });
```

`buildSubgraphSchema` wraps Apollo's builder and prunes unused types.

## Who is calling

The caller comes from a source the server verified — never from the request
body alone.

```ts
// An API that authenticates its own callers: Kratos session, Hydra token.
createYoga({ plugins: [useOryAuth(ory), useAuthenticated()] });

// A subgraph behind a gateway that resolved the caller and put it in `extensions`.
const trustedGateway = gatewaySecret({ secret: process.env.GATEWAY_SECRET! });
createYoga({ plugins: [useAuth({ trustedGateway }), useAuthenticated()] });
new ApolloServer({ plugins: [extractJwtPlugin({ trustedGateway })] });
```

- `useOryAuth(ory)` resolves the caller through Kratos or Hydra, and sets
  `user`, `claims`, `token` and `ory`. An Ory outage is a 503, never an
  anonymous caller. Yoga runs your context factory first; on a request with no
  credential `useOryAuth` sets `user`, `claims` and `token` to `undefined`, so
  the plugin is the single source of the caller.
- `useAuth()` and `extractJwtPlugin()` read the caller a gateway put in the
  GraphQL request's `extensions` — **only** for a request `trustedGateway`
  vouches for. `gatewaySecret({ secret, header? })` holds for a request whose
  `x-gateway-secret` header carries the secret (compared in constant time,
  16 characters at least). Anything else leaves the context without a caller.
  Without a `trustedGateway`, both throw when the server starts.

### `@authenticated(type: [String!])`

```graphql
me: User @authenticated
webhooks: [Webhook!]! @authenticated(type: ["token"])
type Staff @authenticated(type: ["session"]) { … }
```

`useAuthenticated(options?)` enforces it: no caller is `UNAUTHENTICATED`
(401), a caller of a type `type:` does not name is `FORBIDDEN` (403). The type
is Ory's `kind` — `session` or `token` — or `user.tokenType` without Ory;
`useAuthenticated({ types: [...CALLER_TYPES, 'service'] })` names other
values. The field's, its type's and its interfaces' directives are AND-ed; a
scalar's or an enum's guards every field returning it; a subscription is
refused before its stream opens. Refused at build, naming where the directive
sits: `type: []`, an unknown type, and restrictions with nothing in common.

Federation declares `@authenticated` with no argument, and a subgraph imports
that declaration. `useAuthenticated` reads that shape as "any caller", so keep
federation's declaration in a subgraph; `type:` is for the schemas this
package's `SHARED_TYPE_DEFS` builds. Details: [the authentication
guide](./docs/guide/authentication.md).

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
plugins: [useOryAuth(ory), useKetoChecks(ory, { namespaces: ['Note', 'Person'] })]
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
outside `namespaces` (when you pass them), a guard on an interface field,
where no resolver runs, and a `@check` — removed in 3.0 — left in the schema.

`@permission` is read only when its declaration has `name` and `type` — a
schema with its own `@permission` of another shape keeps it. Loading this
package's `graphql/` next to such a declaration merges the two, though: see
[troubleshooting](./docs/troubleshooting.md).

**An outage is never a denial.** A Keto failure throws `OryUnavailable`, which
`createMaskError` answers `503 SERVICE_UNAVAILABLE`.

Every question goes through a per-request memo: distinct questions are
batched into one `POST /relation-tuples/batch/check`, identical ones asked
once, a failed batch not remembered.

### From a resolver: `requireUser` and `can`

```ts
import { can, denial, type OryGraphQLContext, requireUser } from '@nxgt/shared-graphql';
import { ErrorCode } from '@nxgt/shared-exceptions';

async function archive(_: unknown, { id }: { id: string }, ctx: OryGraphQLContext) {
	const user = requireUser(ctx); // UNAUTHENTICATED (401) when nobody is calling
	if (!(await can(ctx, { name: 'edit', type: 'Note', id }))) {
		throw denial(ErrorCode.Forbidden, 'notes.errors.read-only');
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
`@composeDirective(name: "@permission")` and the directive in its own `@link`
import list. Without them the composition drops it silently — the supergraph
SDL comes out valid, the field loses its guard, and nothing fails.

## Errors

A denial — from `@permission`, `@authenticated`, `requireUser` or `can`, or
your own `denial(code, message?)` — is a `GraphQLError` with
`extensions { code, http { status } }`: `UNAUTHENTICATED` 401, `FORBIDDEN` 403,
`NOT_FOUND` 404. Any Yoga or Apollo server answers it with that status. To
translate its message and map the rest, register:

```ts
createYoga({ maskedErrors: { maskError: createMaskError(translate) } });
new ApolloServer({ formatError: createFormatError(translate) });
```

Under Yoga, `createMaskError` translates a denial's key with your
`translate`; turns a `CustomException` into a `GraphQLError` with its code,
status and translated message; `OryUnavailable` into `SERVICE_UNAVAILABLE`
503, recognised even from a second copy of `@nxgt/ory-sdk`; and a plain
`Error` a resolver threw into the mask message, as Yoga's default does.

Under Apollo, `createFormatError` sets the `code` and the translated message
(and `SERVICE_UNAVAILABLE` for an outage, with `http.status` in `extensions`
only — `formatError` cannot change the transport status). Pass `true` as its
second argument in production, and the client reads no internal detail: an
unexpected error answers `Unexpected error.` with `INTERNAL_SERVER_ERROR`, as
`createMaskError` masks it, and no error carries `debugMessage` or a stack
trace.

```ts
new ApolloServer({
	formatError: createFormatError(translate, process.env.NODE_ENV === 'production'),
});
```

## Plugins and context

| Export | What it does |
| --- | --- |
| `useOryAuth(ory)` | Yoga plugin: resolve the caller through Kratos or Hydra, set `user`, `claims`, `token`, `ory` |
| `useAuth({ trustedGateway })` | Yoga plugin: the caller a trusted gateway put in `extensions` — `user`, `token` |
| `extractJwtPlugin({ trustedGateway })` | Apollo plugin: the payload a trusted gateway put in `extensions.payload`, on `context.jwt` |
| `gatewaySecret({ secret, header? })` | the stock `trustedGateway`: a shared secret in a header |
| `useAuthenticated(options?)` | Yoga plugin: enforce `@authenticated(type:)`; `CALLER_TYPES` is the default `types` |
| `applyAuthenticated(schema, options?)` | the same transform on an already-built schema |
| `useKetoChecks(ory, options?)` | Yoga plugin: the per-request Keto memo, and the `@permission` transform |
| `applyKetoChecks(schema, options?)` | the same transform on an already-built schema |
| `requireUser(ctx)`, `can(ctx, question)` | the caller or 401; Keto's answer through the memo |
| `denial(code, message?)` | a refusal as a `GraphQLError` with its status |

`GraphQLBaseContext.user` is `TokenPrincipal` — the caller as the access token
describes them (`sub`, `uid`, `scope`). It is not `Principal`, which is the
header-derived shape used by the REST services.

`createYogaHono` / `honoYoga` (from this package's integrations) mount Yoga on
Hono. `sandboxExplorer` serves Apollo Sandbox, started at the GraphQL endpoint
of the server that served the page — the request's own origin, behind a proxy
and over HTTPS alike — unless `port`, `hostname`, `protocol` or a whole
`initialEndpoint` pins it; `createYogaHono` points it at `yoga.graphqlEndpoint`.

`createYogaHono` serves that page at `/sandbox` outside production only: with
`NODE_ENV=production` the route answers 404. `sandbox: true` serves it in
every environment, `sandbox: false` in none; page options configure it, and
their `enabled` decides the same way.

```ts
createYogaHono(yoga); // the Sandbox outside production
createYogaHono(yoga, { sandbox: { port: env.PORT } }); // configured, still outside production only
createYogaHono(yoga, { sandbox: true }); // in production too
createYogaHono(yoga, { sandbox: { endpoint: 'explore', enabled: true } });
```

Subscriptions go over Redis
(`graphql-subscriptions` is re-exported). `DataLoader` is re-exported so a
subgraph does not take a second copy.

Uploads: the `Upload` scalar lives in this package; `graphql/scalars` ships the
SDL.

## Things that bite

- **`@permission` on a list field is the wrong tool.** Filter before the read.
- **`useAuth()` without the gateway's header reads no caller.** A gateway
  that does not send `x-gateway-secret` on every subgraph request makes every
  caller anonymous. Send it from the gateway, not from clients.
- **An object type's `@authenticated` guards its fields, not the field that
  returns it** (a scalar's or an enum's does guard the fields returning it).
  Put the directive on the field too when the lookup itself must not run for
  an anonymous caller.
- **Do not import `graphql-subscriptions` from `graphql-subscriptions`.** Take
  it from this package, same reason mongoose comes from `@nxgt/shared-mongo`.
- **`stx-sdk` is required.** Unlike `@nxgt/security`, this package does not
  mark it optional.

## Documentation

| Page | Read it when |
| --- | --- |
| [Migrating to 3.0](./docs/guide/migrating-to-3.md) | you upgrade from 2.x |
| [Authentication](./docs/guide/authentication.md) | you wire `useOryAuth`, `useAuth` behind a gateway, or `@authenticated` |
| [Permissions](./docs/guide/permissions.md) | you guard a field with `@permission`, or ask Keto from a resolver |
| [Errors](./docs/guide/errors.md) | you decide what a client receives, or write your own mask |
| [Troubleshooting](./docs/troubleshooting.md) | you have an error message in hand |
| [Roadmap](./docs/roadmap.md) | you want to know what is next |
