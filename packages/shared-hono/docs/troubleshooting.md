# Troubleshooting `@nxgt/shared-hono`

Each entry is headed by the message you see, then says when it happens, why,
and the fix. Every message here is a `TypeError`. Those under *When the app
starts* stop it from booting; those under *When a request runs* answer that
request 500. The last section holds the traps that throw nothing.

Upgrading from 3.x, most of these come from [the
migration](./guide/migrating-to-4.md).

## When the app starts

### ``currentUser(): name the gateway allowed to set the caller — currentUser({ trustedGateway: gatewaySecret({ secret }) }). The X-User-* headers are written by the client; an API that resolves its own callers uses oryAuth(ory)``

**When.** `currentUser()` is called without a `trustedGateway` — typically
the `app.use('/api/*', currentUser())` of a 3.x app.

**Why.** Since 4.0 it needs to know which gateway may name the caller in the
`X-User-*` headers, which a client can otherwise write.

**Fix.** Pass one:

```ts
import { currentUser, gatewaySecret } from '@nxgt/shared-hono';

const trustedGateway = gatewaySecret({ secret: process.env.GATEWAY_SECRET! });
app.use('/api/*', currentUser({ trustedGateway }));
```

An API that authenticates its own callers uses `oryAuth(ory)` and needs
none.

### ``gatewaySecret(): `secret` must be a string of at least 16 characters — is its environment variable set?``

Also `mockAuthMiddleware(): …`, for the secret a spec asked it to send.

**When.** `gatewaySecret({ secret })` or `mockAuthMiddleware(user, { secret })`
is built with a secret that is missing or shorter than 16 characters.

**Why.** Most often an environment variable that is not set where the app
runs; an empty secret must stop the server, not trust an empty header.

**Fix.** Set it, to the same value the gateway sends. A spec's secret needs
16 characters too.

### ``oryAuth(): `trustedGateway` must be a function — gatewaySecret({ secret }), say``

**When.** `oryAuth(ory, { trustedGateway })` is given a secret string, or
anything else that is not a function.

**Why.** `trustedGateway` is a `GatewayTrust` — `(headers) => boolean` — not
the secret itself.

**Fix.** Wrap the secret:

```ts
app.use('*', oryAuth(ory, { trustedGateway: gatewaySecret({ secret }) }));
```

Leave `trustedGateway` out altogether outside the specs: without it
`oryAuth` never reads the `X-User-*` headers.

## When a request runs

### ``principalFromMockHeaders(): name the gateway allowed to set the caller — principalFromMockHeaders(ctx, { trustedGateway: gatewaySecret({ secret }) }). …``

**When.** `await principalFromMockHeaders(ctx)` without the second argument.
It is async, so the error is the rejection of the promise you await.

**Why.** It reads the same client-written headers as `currentUser()`.

**Fix.** `await principalFromMockHeaders(ctx, { trustedGateway })`.

### ``openfetchServiceUser(): `secret` must be a string of at least 16 characters — is its environment variable set?``

**When.** `openfetchServiceUser({ secret })` is built — inside a request, as
it must be — with a secret missing or shorter than 16 characters.

**Why.** It would send an empty proof, which the downstream service refuses
to trust anyway.

**Fix.** Set the variable to the secret the downstream service's
`gatewaySecret` holds.

## Traps that throw nothing

### Every caller is anonymous behind the gateway

`secured()` answers 401 to every request after the upgrade, and the service
logs `X-User-* headers ignored: the request does not come from the trusted
gateway`. The gateway does not send the secret, sends another one, or sends
it in another header. Make it add `x-gateway-secret` — or the `header` you
named — with the value `gatewaySecret` holds, to every request it forwards.

### A route spec's caller is anonymous

The spec signs in with `mockAuthMiddleware(user)` and the route answers 401.
Pass the secret the app's `gatewaySecret` holds — `mockAuthMiddleware(user,
{ secret })` — and, with `oryAuth`, give it the `trustedGateway` too:
`oryAuth(ory, { trustedGateway })`. See [the
migration](./guide/migrating-to-4.md#2-route-specs-send-the-gateways-secret).

### A downstream service sees an anonymous caller

A call made with `openfetchServiceUser()` reaches a service on 4.0, which
ignores the forwarded `X-User-*` headers. Pass the secret that service's
`gatewaySecret` holds: `openfetchServiceUser({ secret })`.

### A confidential client with the ADMIN role gets 403

A principal with a `clientId` and no `username` carries `roles: ['ADMIN']`,
and a `secured()` route it used to pass answers 403. Since 4.1.2 the `ADMIN`
bypass is for users only: a confidential client is held to its `SCOPE_*`
authorities, as the guard always documented. Grant the client the scope the
route names — `secured([['SCOPE_users:read']])` passes a token carrying
`SCOPE_users:read` — or add that scope to the route's OR group.

### A deployed response has no `debugMessage`

Since 4.2.0, `createErrorHandler()` sends `debugMessage` only when the raw
`NODE_ENV` is explicitly `development` or `test`. Under `production`, any
other value, or an unset `NODE_ENV` (which used to answer the detail and no
longer does), the key is missing: a client, a gateway or a test against a
deployed service that read it finds nothing. Read `status` and the translated
`message` instead, and put what a client must see in the `CustomException`'s
message key and `options`. The detail is in the service's log, unless the
handler was built with `logToConsole: false`. To see it locally, set
`NODE_ENV=development`. See [the error handler guide](./guide/error-handler.md).

### A deployed service still answers a `debugMessage`

`NODE_ENV` is `development` or `test` where the service runs: those two are the
only values that answer the detail. Set `NODE_ENV=production` in the service's
environment. An unset `NODE_ENV` no longer answers it (since 4.2.0), so a service still answering one has it
set explicitly.

### A local service no longer answers a `debugMessage`

`createErrorHandler()` sends `debugMessage` only when `NODE_ENV` is explicitly
`development` or `test`; an unset `NODE_ENV` answers as production does. Set it
for the local run, for instance `NODE_ENV=development bun run dev`, or in the
`.env` the dev server loads. The detail is also in the log.

### `Invalid environment variables`

Thrown when `@nxgt/shared-hono` is first imported, after logging the failing
issue, when `NODE_ENV` is set to something other than `development`, `test` or
`production` — `staging`, say. The package validates `NODE_ENV` strictly. Set it
to one of the three and keep the environment's name in another variable:

```sh
NODE_ENV=production APP_ENV=staging bun run start
```

### `principalFromMockHeaders` always names a caller

It returns a promise since 4.0, and a promise is truthy. `await` it.
