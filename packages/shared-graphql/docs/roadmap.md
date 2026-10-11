# Roadmap

What `@nxgt/shared-graphql` does now, what is planned, and what it will not do.

## Now

The GraphQL layer for Yoga and Apollo services: shared SDL, scalars and
directives shipped in `graphql/`, `useOryAuth`, `useAuthenticated` and
`useKetoChecks` for an Ory-native API, `useAuth` behind a trusted gateway,
denials that carry their status, `createMaskError` / `createFormatError`,
dataloaders, subscriptions over Redis, uploads and the Hono integration.

## Next

Nothing planned that changes what a consumer gets. See Later.

## Later

- **Batching a list argument's ids** into one Keto batch rather than one
  question per id in order.

## Not planned

- **A directive on a list field** that filters after the read. "Which objects
  may I see" is a Keto query folded into the database filter.
- **OR between directives.** It belongs in the Keto model.
- **Turning an Ory outage into a denial or an anonymous caller**, under any
  option. It is a 503.

## Shipped

### 3.2

- **The Sandbox page off unless in development**: `createYogaHono` serves it
  only when `NODE_ENV` is explicitly `development` or `test` (unset or
  anything else answers 404), and `sandbox: true` (or `enabled: true` beside
  its options) serves it in every environment.
- **`createFormatError`'s production mode hides internal detail**: an
  unexpected error answers `Unexpected error.`, and no error carries
  `debugMessage` or a stack trace.

### 3.0 — [migration guide](./guide/migrating-to-3.md)

- **The caller comes from a verified source only**: `useAuth()` and
  `extractJwtPlugin()` read `extensions` only for a request
  `trustedGateway` vouches for — `gatewaySecret({ secret })` by default — and
  refuse to start without one.
- **`@check` removed**, leaving `@permission`; a `@check` left in a schema is
  refused at build, and the mistakes 2.x only warned about on it are
  `TypeError`s.
- **`@authenticated(type: [String!])`**, enforced by `useAuthenticated()`:
  401 for no caller, 403 for a caller of another type. Federation's
  argument-less declaration is read as "any caller".
- **Denials are `GraphQLError`s** with `extensions { code, http { status } }`
  — `denial(code, message?)` — so a server without `createMaskError` answers
  401/403/404 rather than a masked 500.
- **Five unused dependencies dropped**: `@graphql-hive/gateway`,
  `@envelop/generic-auth`, `@envelop/extended-validation`,
  `@hono/zod-validator`, `zod`.
- **Peers bounded**: `@nxgt/ory-sdk` `>=0.1.0 <1`, `graphql` `^16.9.0 ||
  ^17.0.0`.
- **`sandboxExplorer`**, the sandbox helper's corrected name.

### 2.1

- **`@permission(name, type, id, onDeny, message)`**, the flat form, answered
  with `@check` in declaration order; `@check` deprecated in its favour.
- **More refused at build**: an argument the field does not declare, a
  namespace outside the model (`namespaces`), a guard on an interface field —
  each a `TypeError` naming the field for `@permission`, and a warning for
  `@check`, which booted with the first and last before.
- **`requireUser`, `can` and `OryGraphQLContext`** for resolvers, through the
  same per-request memo.
- **The directive SDL as strings** — `PERMISSION_DIRECTIVE_SDL`,
  `CHECK_DIRECTIVE_SDL`, `KETO_DIRECTIVES_SDL` — held equal to the files.
- **graphql 17**: `graphql` is a peer, `^16.4.2 || ^17.0.0`, and the suite
  runs on both.
- **An outage under Apollo is a 503 too**, and one from a second copy of
  `@nxgt/ory-sdk` is still recognised.
- **Internal messages masked**: a plain `Error` a resolver threw no longer
  reaches the client through `createMaskError`.
