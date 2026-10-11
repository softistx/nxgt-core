# Roadmap

What `@nxgt/shared-hono` does now, what is planned, and what it will not do.

## Now

The Hono application layer: the error handler, `currentUser()` behind a
trusted gateway and `secured()`, `oryAuth`, `oryChecks`, `ketoCheck` and
`requireAuthenticated` for an Ory-native API, the rate limiter, the typed
`openapi-fetch` client and the MCP server wiring.

## Next

Nothing planned that changes what a consumer gets. See Later.

## Later

- **A rate-limit key that is not a client header.** `rateLimiter()` keys on
  `x-forwarded-for` unless given a `keyGenerator`; a key read from a header
  only your proxy writes would make the default safe. Without that header the
  default key is `''`, so every such caller shares one counter and one of
  them can exhaust it for all; until then, pass a `keyGenerator`.
- **The MCP introspection URL as an option**, rather than the hardcoded
  `http://localhost:8080/api`.

## Not planned

- **A default `trustedGateway`**, or one that always answers `true`. The
  `X-User-*` headers are written by the client; which gateway may set them is
  the app's decision, every time.
- **Turning an Ory outage into an anonymous caller**, under any option. It is
  a 503.

## Shipped

### 4.2

- **A secure-by-default error handler**: `createErrorHandler()` answers
  `debugMessage` only when `NODE_ENV` is explicitly `development` or `test`;
  production, any other value and an unset `NODE_ENV` get the body without
  it, and the detail goes to the log.

### 4.0 — [migration guide](./guide/migrating-to-4.md)

- **The caller comes from a verified source only**: `currentUser()` reads the
  `X-User-*` headers only for a request `trustedGateway` vouches for —
  `gatewaySecret({ secret })`, the same function `@nxgt/shared-graphql` 3.0
  uses — and refuses to start without one.
- **`oryAuth` reads a route spec's mock headers only with a
  `trustedGateway`**, and only under `NODE_ENV=test`.
- **`principalFromMockHeaders(ctx, { trustedGateway })`** is gated the same
  way, and async.
- **`mockAuthMiddleware(user, { secret })` and
  `openfetchServiceUser({ secret })`** send the gateway's proof.
