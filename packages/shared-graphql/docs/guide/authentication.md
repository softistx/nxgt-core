# Authentication: who is calling, and `@authenticated`

A resolver reads the caller from `context.user`. This page is where that value
comes from, which sources are trusted, and how `@authenticated` refuses a
missing caller or one of the wrong kind.

## The rule: a verified source, never the body alone

The GraphQL request's `extensions` travel in the request body, which any
client writes. So the caller comes from one of two places:

| Source | Plugin | Verified by |
| --- | --- | --- |
| a Kratos session or a Hydra access token | `useOryAuth(ory)` | Ory, server-side, on every request |
| what a gateway resolved and put in `extensions` | `useAuth()` / `extractJwtPlugin()` | the gateway's proof — `trustedGateway` — on every request |

Anything else leaves the context without a caller.

## `useOryAuth(ory)` — an API that authenticates its own callers

```ts
import { createOry } from '@nxgt/ory-sdk';
import { useAuthenticated, useOryAuth } from '@nxgt/shared-graphql';

const ory = createOry({ /* … */ });

createYoga({ plugins: [useOryAuth(ory), useAuthenticated()] });
```

It reads `Authorization: Bearer`, then `X-Session-Token`, then the Kratos
cookie, and puts `user`, `claims`, `token` and `ory` on the context. An Ory
outage throws a 503 `SERVICE_UNAVAILABLE`, never an anonymous caller.

Yoga runs your context factory before plugins, and `useOryAuth()` is the single
source of the caller. On a request with no credential it sets `user`, `claims`
and `token` to `undefined` as own keys, so a value your factory put there is
cleared (`ory` is `null`). A Bearer token that Ory rejects leaves `user` and
`claims` `undefined`, but `token` holds the rejected string.

## `useAuth()` and `extractJwtPlugin()` — behind a gateway

A gateway that authenticated the caller can forward it to subgraphs in the
request's `extensions`: `user` and `token` for `useAuth()` (Yoga),
`payload` for `extractJwtPlugin()` (Apollo Server). Both read it **only** when
`trustedGateway` holds for the request:

```ts
import { extractJwtPlugin, gatewaySecret, useAuth } from '@nxgt/shared-graphql';

const trustedGateway = gatewaySecret({ secret: process.env.GATEWAY_SECRET! });

createYoga({ plugins: [useAuth({ trustedGateway })] });
new ApolloServer({ plugins: [extractJwtPlugin({ trustedGateway })] });
```

### `gatewaySecret({ secret, header? })`

Holds for a request whose `header` — `x-gateway-secret` by default — carries
`secret`, compared in constant time. The gateway adds it to every subgraph
request; a client that reaches the service directly does not know it, and its
`extensions` are ignored.

| Option | Default | Meaning |
| --- | --- | --- |
| `secret` | — | shared with the gateway only; **at least 16 characters**, or `gatewaySecret` throws when it is built |
| `header` | `x-gateway-secret` | the header the gateway sends it in |

The length check is there for the day `GATEWAY_SECRET` is unset: the server
stops at boot instead of trusting an empty header.

### Another proof

`trustedGateway` is any function of the request's headers:

```ts
type GatewayTrust = (headers: { get(name: string): string | null | undefined }) => boolean | Promise<boolean>;

// Your proxy terminates mTLS and sets this header only for the gateway's certificate.
useAuth({ trustedGateway: (headers) => headers.get('x-client-cert-subject') === 'CN=gateway' });
```

It receives a fetch `Headers` under Yoga and Apollo's `HeaderMap` under
Apollo Server; both answer `get`.

### What is read

- `useAuth()`: `extensions.user` when it is an object with a non-empty string
  `sub`, and `extensions.token` when it is a string. A valid `user` with no
  string `token` sets `token` to `undefined`, clearing any earlier value. With
  no valid `user`, nothing is written.
- `extractJwtPlugin()`: `extensions.payload`, under the same `sub` rule, on
  `context.jwt.payload`.
- A request that fails the proof leaves `user`, `token` and `jwt` as they
  were — another plugin's caller is not erased.
- Over WebSocket, `useAuth()` reads no caller: the proof needs a fetch
  `Request`, which a graphql-ws context does not hold. Resolve the caller per
  connection with `resolveWsUser` instead.

Without a `trustedGateway`, both throw a `TypeError` when called — see
[troubleshooting](../troubleshooting.md).

## `@authenticated(type: [String!])`

```graphql
directive @authenticated(type: [String!]) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
```

Declared in `SHARED_TYPE_DEFS` and in `AUTHENTICATED_DIRECTIVE_SDL`; enforced
by `useAuthenticated()`, or `applyAuthenticated(schema)` on a built schema.

```graphql
type Query {
	me: User @authenticated                      # any caller
	webhooks: [Webhook!]! @authenticated(type: ["token"])  # a machine client, not a session
}

interface Node @authenticated { id: ID! }
type Staff implements Node @authenticated(type: ["session"]) { id: ID!, name: String }
```

| Caller | Answer |
| --- | --- |
| none (`context.user` unset) | `UNAUTHENTICATED`, HTTP 401 |
| of a type no applicable `type:` names | `FORBIDDEN`, HTTP 403 |
| otherwise | the resolver runs |

- **The caller's type** is `context.ory.kind` — `session` for a Kratos
  session, `token` for an access token — or `context.user.tokenType` when no
  Ory principal is on the context.
- **Every directive that applies is AND-ed**: the field's, its type's, its
  type's interfaces', and those interfaces' same field. `Staff.name` above
  needs a caller (`Node`) who is a session (`Staff`).
- **A scalar's or an enum's directive guards every field returning it** —
  `scalar Secret @authenticated` refuses `Query.secret: Secret` to an
  anonymous caller, as federation's router reads it.
- **A subscription is refused before its stream opens**: the check runs
  before the field's `subscribe`, and again before each event is resolved.
- **A type's directive guards its fields, not the field returning it.**
  `Query.staff` runs for an anonymous caller; the error lands on
  `staff.name`. Put `@authenticated` on the field too when the lookup must not
  run.

### Other caller types

```ts
import { CALLER_TYPES, useAuthenticated } from '@nxgt/shared-graphql';

useAuthenticated({ types: [...CALLER_TYPES, 'service'] });
```

`types` lists every value a `type:` may name; `CALLER_TYPES` —
`['session', 'token']` — is the default. Behind a gateway, it is the set
of `tokenType`s your gateway writes.

### Refused at build

`applyAuthenticated` throws a `TypeError` for a directive no request could
pass, naming where it sits — `Query.me` on a field, `Staff` on a type,
`Secret` on a scalar:

| Mistake | Message starts |
| --- | --- |
| `type: []` | ``@authenticated on Query.me: `type: []` admits no caller`` |
| a type outside `types` | `@authenticated on Query.me: unknown type "staff" — known: session, token` |
| restrictions with no type in common | ``@authenticated on Note.body: the field's, its type's and its interfaces' `type`s have none in common`` |

### Federation's `@authenticated`

Federation defines its own `@authenticated`, with **no argument**, and a
subgraph imports it:

```graphql
extend schema @link(url: "https://specs.apollo.dev/federation/v2.5", import: ["@authenticated"])
```

`useAuthenticated` accepts that shape: an `@authenticated` whose declaration
has no `type` means "any caller", and is enforced as such. So in a subgraph,
keep federation's declaration — `FEDERATION_DIRECTIVES` carries it unchanged
— and do not load `SHARED_TYPE_DEFS` beside it. `type:` is for a schema that
declares `@authenticated` through `SHARED_TYPE_DEFS` or
`AUTHENTICATED_DIRECTIVE_SDL`.

### Beside `useKetoChecks`

Both plugins replace the schema. Each marks the fields it guarded and leaves a
marked field alone, so the two settle on one schema in either order — and a
schema merged from a guarded half and an unguarded one gets the second half
guarded when it is transformed again, as is a field whose resolver was
replaced since. On a field carrying both,
`@authenticated` is checked before `@permission` whatever the plugin order,
so a caller of the wrong type is `FORBIDDEN` before Keto is asked:

```ts
plugins: [useOryAuth(ory), useAuthenticated(), useKetoChecks(ory)]
```
