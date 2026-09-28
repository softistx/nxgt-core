---
'@nxgt/shared-hono': major
---

4.0: the caller comes only from a verified source. Every break has a before and after in [Migrating to 4.0](https://github.com/softistx/nxgt-core/blob/develop/packages/shared-hono/docs/guide/migrating-to-4.md).

- **Security — `currentUser()` no longer trusts the `X-User-*` headers.** It built the caller from `X-User-Id`, `X-User-Authorities`, `X-Roles`, `X-Client-Id` and the rest on every request, and a client writes its own headers, so a client reaching a service directly could name itself anyone, with any authority. **`currentUser()` now takes `{ trustedGateway }` and reads the headers only for a request it vouches for**; `gatewaySecret({ secret, header? })` is the stock proof (a header compared in constant time, `x-gateway-secret` by default, a secret of at least 16 characters) — the same function `@nxgt/shared-graphql` 3.0 uses, re-exported from `@nxgt/security/gateway`. **Without a `trustedGateway`, `currentUser()` throws a `TypeError` when called.** A request without the proof is ignored, not refused: it is anonymous, and `secured()` answers it 401.
- **`oryAuth(ory)` reads a route spec's mock `X-User-*` headers only with `oryAuth(ory, { trustedGateway })`**, and still only under `NODE_ENV=test`: a deployment running with `NODE_ENV=test` answered forged headers as the caller they named.
- **`principalFromMockHeaders(ctx, { trustedGateway })` requires the option, and returns a `Promise`.**
- `mockAuthMiddleware(user, { secret })` and `openfetchServiceUser({ secret })` send the gateway's proof; without it a service on 4.0 sees an anonymous caller.
- New exports: `gatewaySecret`, `GATEWAY_SECRET_HEADER`, `requireGatewayTrust`, and the types `GatewayTrust`, `GatewayTrustOptions`, `GatewaySecretOptions`, `HeaderReader`, `CurrentUserOptions`, `OryAuthOptions`. The package now ships a `docs/` folder: the migration guide, troubleshooting and a roadmap.
