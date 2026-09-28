# Troubleshooting `@nxgt/shared-hono`

Each entry is headed by the message you see; the parts in `<angle brackets>`
vary. Messages thrown when the app starts are `TypeError`s, and stop it from
booting. The last section holds the traps that throw nothing.

Upgrading from 3.x, most of these come from [the
migration](./guide/migrating-to-4.md).

## When the app starts

### ``currentUser(): name the gateway allowed to set the caller — currentUser({ trustedGateway: gatewaySecret({ secret }) }). The X-User-* headers are written by the client; an API that resolves its own callers uses oryAuth(ory)``

Also `principalFromMockHeaders(): name the gateway allowed to set the caller — …`,
thrown when it is called.

Since 4.0 both need to know which gateway may name the caller in the
`X-User-*` headers, which a client can otherwise write. Pass one:

```ts
import { currentUser, gatewaySecret } from '@nxgt/shared-hono';

const trustedGateway = gatewaySecret({ secret: process.env.GATEWAY_SECRET! });
app.use('/api/*', currentUser({ trustedGateway }));
```

An API that authenticates its own callers uses `oryAuth(ory)` and needs
neither.

### ``gatewaySecret(): `secret` must be a string of at least 16 characters — is its environment variable set?``

Also `mockAuthMiddleware(): …` and `openfetchServiceUser(): …`, for the
secret you asked them to send.

The secret is missing or shorter than 16 characters — most often an
environment variable that is not set where the app runs. Set it, to the same
value the gateway sends. A spec's secret needs 16 characters too.

### ``oryAuth(): `trustedGateway` must be a function — gatewaySecret({ secret }), say``

`oryAuth(ory, { trustedGateway })` was given a secret string, or something
else that is not a `GatewayTrust`. Wrap the secret:

```ts
app.use('*', oryAuth(ory, { trustedGateway: gatewaySecret({ secret }) }));
```

Leave `trustedGateway` out altogether outside the specs: without it
`oryAuth` never reads the `X-User-*` headers.

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

### `principalFromMockHeaders` always names a caller

It returns a promise since 4.0, and a promise is truthy. `await` it.
