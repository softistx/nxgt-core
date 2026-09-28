# Migrating to 4.0

`@nxgt/shared-hono` 4.0 is a major release for one security fix: **the
`X-User-*` headers name the caller only for a request your gateway vouches
for.** Each section below is one break: what changed, why, and the code
before and after.

| # | Break | You are affected if you… |
| --- | --- | --- |
| 1 | [`currentUser()` needs a trusted gateway](#1-currentuser-needs-a-trusted-gateway) | use `currentUser()` |
| 2 | [Route specs send the gateway's secret](#2-route-specs-send-the-gateways-secret) | sign a spec in with `mockAuthMiddleware` |
| 3 | [`principalFromMockHeaders` needs a trusted gateway, and is async](#3-principalfrommockheaders-needs-a-trusted-gateway-and-is-async) | call it |
| 4 | [`openfetchServiceUser` sends the secret you give it](#4-openfetchserviceuser-sends-the-secret-you-give-it) | forward the caller to a service that uses `currentUser()` |

The proof is the one `@nxgt/shared-graphql` 3.0 uses — `gatewaySecret({
secret })`, an `x-gateway-secret` header compared in constant time — and it
is the same function: both packages re-export it from `@nxgt/security/gateway`.
One secret serves a gateway that fronts REST and GraphQL services alike.

## 1. `currentUser()` needs a trusted gateway

**Why.** `currentUser()` built the caller from the `X-User-*` headers
(`X-User-Id`, `X-User-Authorities`, `X-Roles`, `X-Client-Id`, …) of every
request. A client writes its own headers, so anyone who reached the service
directly — not through the gateway that sets them — could name themselves
anyone, with any authority:

```sh
curl -H 'X-User-Id: someone-else' -H 'X-Roles: ADMIN' https://orders.internal/api/orders
```

In 3.x that request passed `secured([['ADMIN']])` as `someone-else`. In 4.0
the headers are read only for a request that proves it came from your
gateway; any other request is anonymous, and `secured()` answers it 401.

**Before**

```ts
import { currentUser, secured } from '@nxgt/shared-hono';

app.use('/api/*', currentUser());
```

**After**

```ts
import { currentUser, gatewaySecret, secured } from '@nxgt/shared-hono';

app.use(
	'/api/*',
	currentUser({
		trustedGateway: gatewaySecret({ secret: process.env.GATEWAY_SECRET! }),
	}),
);
```

Then make the gateway send the secret on every request it forwards, in the
`x-gateway-secret` header (or the one you name with `header`). Whatever the
gateway is, it is one header added beside the `X-User-*` ones it already
sets:

```ts
upstream.headers.set('x-gateway-secret', process.env.GATEWAY_SECRET!);
```

- A request without the header, or with a wrong one, keeps the context
  without a caller: no `principal`, no `X-User-*` variables. It is **ignored,
  not refused** — as in `@nxgt/shared-graphql` 3.0 — so a public route keeps
  answering it and a `secured()` route answers 401. The service logs
  `X-User-* headers ignored: the request does not come from the trusted
  gateway` when it drops one.
- `gatewaySecret` refuses, when it is built, a secret shorter than 16
  characters — an unset variable stops the server instead of trusting an
  empty header.
- `trustedGateway` can be any `(headers) => boolean | Promise<boolean>`, for
  a proof other than a shared secret (an mTLS header your proxy sets, say).
- Called without a `trustedGateway`, `currentUser` throws a `TypeError` when
  the app starts:
  ``currentUser(): name the gateway allowed to set the caller — …``.
- Strip `x-gateway-secret` from what the gateway accepts from clients, as
  you already strip `X-User-*`: the secret must travel gateway → service
  only.

An API that authenticates its own callers — a Kratos session, a Hydra token
— needs no gateway: use `oryAuth(ory)`, which verifies the credential
server-side.

## 2. Route specs send the gateway's secret

**Why.** Two helpers let a route spec sign in without a real credential, by
sending `X-User-*` headers: `currentUser()` read them always, and
`oryAuth()` read them whenever `NODE_ENV` was `test` — a deployment running
with `NODE_ENV=test` answered forged headers as the caller they named. Both
now read them only with the gateway's proof, so a spec sends it.

**Before**

```ts
app.use('*', oryAuth(ory));

client.use(mockAuthMiddleware(mockUser({ username: 'ada' })));
```

**After**

```ts
const TEST_GATEWAY_SECRET = 'a-test-only-secret-of-32-chars!!';
const trustedGateway = gatewaySecret({ secret: TEST_GATEWAY_SECRET });

app.use('*', oryAuth(ory, { trustedGateway }));   // or currentUser({ trustedGateway })

client.use(
	mockAuthMiddleware(mockUser({ username: 'ada' }), {
		secret: TEST_GATEWAY_SECRET,
	}),
);
```

- `oryAuth`'s `trustedGateway` is optional. Without it the `X-User-*` headers
  are never read — which is what production wants. With it they are read
  only under `NODE_ENV=test` **and** for a request it vouches for; outside
  `NODE_ENV=test` `oryAuth` reads a Kratos session or a Hydra token and
  nothing else.
- `mockAuthMiddleware(user)` without the second argument still sends the
  headers, and an app that trusts a gateway now ignores them: the spec sees
  an anonymous caller, and a guarded route answers 401.

## 3. `principalFromMockHeaders` needs a trusted gateway, and is async

**Why.** It is the same reader as `currentUser()`, exported for a service
that verifies tokens itself; it read the headers of any request.

**Before**

```ts
const principal = principalFromMockHeaders(ctx);
```

**After**

```ts
const principal = await principalFromMockHeaders(ctx, { trustedGateway });
```

It resolves `undefined` for a request without `X-User-*` headers **or**
without the gateway's proof, and throws a `TypeError` without a
`trustedGateway`. It returns a promise because a `trustedGateway` may be
asynchronous; forgetting the `await` hands your code a `Promise`, which is
truthy.

## 4. `openfetchServiceUser` sends the secret you give it

**Why.** It forwards the current caller to a REST service as `X-User-*`
headers. A service on 4.0 ignores them without the gateway's proof, so the
call now carries it when you pass the secret. The argument is optional, which
is what makes this one quiet: without it, the downstream call arrives
anonymous.

**Before**

```ts
client.use(openfetchServiceUser());
```

**After**

```ts
client.use(openfetchServiceUser({ secret: process.env.GATEWAY_SECRET! }));
```

A service that forwards the caller this way is acting as the gateway for the
service it calls, so it holds that service's secret. The header is sent only
when there is a caller to forward.
