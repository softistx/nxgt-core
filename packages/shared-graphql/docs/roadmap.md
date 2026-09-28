# Roadmap

What `@nxgt/shared-graphql` does now, what is planned, and what it will not do.

## Now

The GraphQL layer for Yoga and Apollo services: shared SDL, scalars and
directives shipped in `graphql/`, `useOryAuth` and `useKetoChecks` for an
Ory-native API, `createMaskError` / `createFormatError`, dataloaders,
subscriptions over Redis, uploads and the Hono integration.

## Next — a planned major

Each of these changes what an existing consumer gets, so they wait for a major
release, together:

- **`@check` removed**, leaving `@permission`. A field whose `@check` holds an
  OR moves that OR into the Keto model first.
- **`@authenticated(type: [String!])`** — refusing a caller of the wrong kind
  (a session where a client token is expected) at the directive. It changes
  the declaration that federation's own `@authenticated` shares, so it cannot
  be added in place.
- **Dependencies this package does not import are dropped** —
  `@graphql-hive/gateway`, `@envelop/generic-auth`,
  `@envelop/extended-validation`, `@hono/zod-validator`, `zod`. An app that
  imports one of them without declaring it would stop installing it.
- **`useAuth()` and `extractJwtPlugin` stop reading the caller from the request
  body's `extensions`** unless told which gateway may set them.
- **`@nxgt/ory-sdk` peered with a ceiling** (`>=0.1.0 <1`), so a breaking SDK
  major is not admitted untested.
- **The peer floors raised to what is tested** — `graphql` `^16.9.0 ||
  ^17.0.0`.
- **The sandbox helper renamed** from `sandboxExpolorer` to `sandboxExplorer`.
- **A denial thrown as a `GraphQLError`** with its `code` and HTTP status, so a
  server without `createMaskError` answers 404/403 rather than a masked 500.

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

- **`@permission(name, type, id, onDeny, message)`**, the flat form, answered
  with `@check` in declaration order; `@check` deprecated in its favour.
- **More refused at build**: an argument the field does not declare, a
  namespace outside the model (`namespaces`), a guard on an interface field —
  each a `TypeError` naming the field.
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
