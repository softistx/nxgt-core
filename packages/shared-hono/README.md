# @nxgt/shared-hono

The Hono application layer: error handler, auth and rate-limit middleware, the
typed `openapi-fetch` client, and an MCP server integration.

**Upgrading from 3.x?** Read [Migrating to 4.0](./docs/guide/migrating-to-4.md):
`currentUser()` now needs a `trustedGateway`, and forged `X-User-*` headers
name nobody.

## Install

```bash
bun add @nxgt/shared-hono
```

Public on npmjs; no token needed to install. TypeScript is a peer:
`^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set
installs with either. **`stx-sdk` is a required peer** (`>=1.1.0`): an install that
cannot resolve it fails. It is public on npmjs.

There is no `createApp`. This package is middleware, an error handler, and two
subpaths — not an application factory.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-hono` | middleware, error handler, env |
| `@nxgt/shared-hono/openapi-fetch` | the typed REST client (`export *` of `openapi-fetch` plus the default factory) |
| `@nxgt/shared-hono/mcp` | Model Context Protocol server wiring (`createMcpServerApp`) |

The error handler answers with `CustomException.code` as the HTTP status — that
is the contract that keeps `code` numeric in `@nxgt/shared-exceptions`.

## Language

Importing this package registers `honoLanguageSource` with `@nxgt/i18n`: its
`getLanguage()`, `translate` and the error handler below speak the request's
language — the `language` variable `hono/language`'s `languageDetector()`
sets, read through `contextStorage()`.

```ts
import { contextStorage } from 'hono/context-storage';
import { languageDetector } from 'hono/language';

app.use(contextStorage());
app.use(languageDetector({ supportedLanguages: ['en', 'fr'], fallbackLanguage: 'en' }));
```

`@nxgt/i18n` did this itself until 2.0. `useHonoLanguage()` registers it
explicitly, and answers the function that removes it; `c.get('language')` is
typed as `@nxgt/i18n`'s `Language` by this package's `ContextVariableMap`.

## Error handler

```ts
import { createErrorHandler } from '@nxgt/shared-hono';
import { translate } from '@nxgt/i18n';

app.onError(createErrorHandler(translate));
```

`CustomException` becomes `{ status, message, timestamp }`, plus
`debugMessage` in development and test, with `message` translated.
`HTTPException` keeps its status and message. Anything else is a 500 with the
translated `errors.internal-server-error`.

**`debugMessage` is only sent when `NODE_ENV` is `development` or `test`.**
Under `production`, any other value, or an **unset** `NODE_ENV`, the body has
no `debugMessage` — no exception detail, no stack, no error message: only
`status`, the translated `message` and `timestamp`. That detail goes to the
logger instead. See [the error handler guide](./docs/guide/error-handler.md).

**Upgrading to 4.2:** an unset `NODE_ENV` used to count as development and no
longer does, so a response that carried `debugMessage` now omits it. Set
`NODE_ENV=development` locally to get it back.

## Auth

Two worlds, both first-class.

**Gateway headers** — a service behind a gateway that resolves the caller.
`currentUser({ trustedGateway })` builds a `Principal` from `USER_HEADERS`
(`X-User-Id`, …) — **only for a request `trustedGateway` vouches for**. The
client writes its own headers; without the gateway's proof they name nobody.

```ts
import { currentUser, gatewaySecret, secured } from '@nxgt/shared-hono';

app.use('/api/*', currentUser({
  trustedGateway: gatewaySecret({ secret: process.env.GATEWAY_SECRET! }),
}));
app.get('/api/users', secured([['ADMIN'], ['users:read']]), handler);
```

The gateway sends the secret in `x-gateway-secret` (`GATEWAY_SECRET_HEADER`,
or the one you pass as `gatewaySecret({ secret, header })`) on every request
it forwards. `gatewaySecret` compares it in constant time and refuses, at
startup, a secret shorter than 16 characters; `trustedGateway` may also be any
`(headers) => boolean | Promise<boolean>`. There is no default: `currentUser()`
without one throws. It is the same `gatewaySecret` as `@nxgt/shared-graphql`'s
`useAuth()`, from `@nxgt/security/gateway`. `requireGatewayTrust(options,
caller)` is the same refusal, for a middleware of your own that reads the
headers.

`secured([['ADMIN'], ['users:read']])` is Apollo-federation `requireScopes`
semantics: outer AND, inner OR. A user whose `roles` include `ADMIN` passes
every guard. A confidential client (a `clientId` and no `username`) only
matches `SCOPE_*` authorities, and the `ADMIN` role does not let it past a
scope it lacks:

```ts
app.get('/api/users', secured([['SCOPE_users:read']]), handler);
// { clientId: 'backoffice', roles: ['ADMIN'], authorities: [] }               → 403
// { clientId: 'backoffice', authorities: ['SCOPE_users:read'] }               → 200
// { username: 'ada', roles: ['ADMIN'], authorities: [] }                      → 200
```

In a route spec, send the caller and the secret together:
`client.use(mockAuthMiddleware(mockUser({ username: 'ada' }), { secret }))`.

**Ory-native** — an API that resolves its own callers. `oryAuth(ory)` authenticates and stops
there — an anonymous caller reaches `next()`, because authenticating is not
deciding. Two middlewares decide:

```ts
app.use('*', oryAuth(ory));
app.use('*', oryChecks(ory));          // the per-request Keto answer cache
app.use('/api/*', requireAuthenticated());   // 401 for nobody

app.get('/:id',
  ketoCheck([[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }]]),
  handler);

app.patch('/:id',
  ketoCheck([[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }]]),
  ketoCheck([[{ namespace: 'Bookmark', permit: 'edit', id: 'param.id' }]],
            { onDeny: 'FORBIDDEN' }),
  handler);
```

`requireAuthenticated()` is everything a rules file used to say about an
Ory-native API — `authenticated: true`, and nothing else, because an Ory
principal carries no authorities.

`ketoCheck` takes the same `[[ ]]` grammar as `keto` rungs in
`@nxgt/security`, and the same evaluator from `@nxgt/ory-sdk`: **outer list
OR, inner list AND**, short-circuit in both directions. `id` is a path —
`param.<name>`, `query.<name>` or `json.<path>` — and a value that turns out to
be a list requires the permit on every element.

**Two of them, in that order, is the 404/403 ladder.** A stranger fails `view`
and gets 404, so ids cannot be probed; a viewer passes it, fails `edit`, and
gets 403.

**Word the refusal like the layer beneath it.** `message` sets the i18n key a
denial carries; without it the shared `errors.not-found` /
`errors.insufficient-permissions` are used. These routes are guarded twice — by
`ketoCheck`, and by the `<m>.access.ts` their service calls — and if the two
word one 404 differently, the wording alone tells the caller which refused: a
generic message means "you may not", a domain one means "it is gone". That is
the distinction 404 exists to hide.

```ts
ketoCheck([[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }]],
          { message: 'bookmarks.errors.not-found' });
```

`oryChecks(ory)` puts a per-request loader on the context that **batches**
distinct questions into one `POST /relation-tuples/batch/check` and
**memoises** identical ones, so a route guarded by `ketoCheck(view)` and a
service that then asks the same question pay for one round trip between them.

A Keto outage is never a denial: `OryUnavailable` reaches
`withOryUnavailable(...)` and answers 503.

`acceptQuery()` sets `Accept-Query: application/json` on the response after
the handler, advertising QUERY support without changing the `POST …/search`
route it shares handlers with.

`openfetchServiceUser({ secret })` is `openapi-fetch` middleware that copies
the current `USER_HEADERS` context onto outbound REST calls, with the
downstream service's gateway secret, so a GraphQL resolver talking to a REST
service forwards the same principal the gateway set.

## Rate limiter

`rateLimiter({ redisUrl, redisToken, prefix, … })`. `redis://` uses ioredis;
an `https://` Upstash URL uses `@upstash/redis` and needs `redisToken`. Two
limiters on the same Redis silently share counters unless given distinct
`prefix` values (`RedisStore` defaults to `"hrl:"`).

## `openapi-fetch`

```ts
import createClient from '@nxgt/shared-hono/openapi-fetch';
```

The star re-export of `openapi-fetch` lives in this entry point, not below it —
Bun mis-compiles `export *` of an external package in a module that is not an
entry.

## MCP

`@nxgt/shared-hono/mcp` re-exports `@modelcontextprotocol/{hono,server}` (again,
from the entry point) and `createMcpServerApp(server)`. The helper introspects
the caller's bearer token through `stx-sdk/auth` before handing the request to
the MCP transport. The introspect base URL is currently hardcoded to
`http://localhost:8080/api` — a consumer in another environment must not assume
it follows `PORT`.

## Things that bite

- **`secured` and `ketoCheck` nest in opposite directions.** `secured` is
  outer AND, inner OR (authorities). `ketoCheck` is outer OR, inner AND
  (permissions).
- **Forged `X-User-*` headers are ignored, not refused.** A request without
  the gateway's proof is anonymous: a public route still answers it, and
  `secured()` answers 401. Every caller anonymous after upgrading means the
  gateway is not sending the secret — see
  [troubleshooting](./docs/troubleshooting.md).
- **`oryAuth` reads mock headers only with a `trustedGateway`, and only in
  `NODE_ENV=test`.** Route specs pass `oryAuth(ory, { trustedGateway })` and
  `mockAuthMiddleware(user, { secret })`; production passes no
  `trustedGateway` at all.
- **`openfetchServiceUser()` without a secret forwards an anonymous caller**
  to a service on 4.0. Pass `{ secret }`.
- **`openfetchServiceUser({ secret })` hands the secret to whatever the
  client calls.** Use it only on clients for your internal services: the
  secret lets its holder name any caller to every service that trusts it.
- **`principalFromMockHeaders` is async.** Without the `await`, the promise
  is truthy and reads as a caller.
- **`rateLimiter()` keys on `x-forwarded-for` by default**, which a client
  can set when nothing in front of the service overwrites it. Behind a proxy
  that does not, pass a `keyGenerator` reading something the client cannot
  write.
- **Without `x-forwarded-for`, every caller shares one counter.** The
  default key is then `''`, so one caller can spend the limit for all the
  others. Pass a `keyGenerator`. Behind a proxy, key on what the proxy
  writes and the client cannot, or on the authenticated principal: the
  socket address is the proxy's, the same for everyone. A service reached
  directly and served by `Bun.serve` can key on the socket address:

  ```ts
  import { getConnInfo } from 'hono/bun';

  app.use('/api/*', rateLimiter({
    keyGenerator: (c) => getConnInfo(c).remote.address ?? 'unknown',
  }));
  ```

  `getConnInfo` reads the Bun server from `c.env`, so it throws under
  `app.request()` in a spec; there, pass a `keyGenerator` that reads a header.
- **`openfetchServiceUser` reads the Hono context at construction.** Call it
  inside a request (or from `tryGetContext()`-aware code), not at module
  scope, or it captures an empty context forever.

## Docs

| Page | Read it when |
| --- | --- |
| [Migrating to 4.0](./docs/guide/migrating-to-4.md) | you upgrade from 3.x |
| [Troubleshooting](./docs/troubleshooting.md) | you have an error message in hand |
| [Roadmap](./docs/roadmap.md) | you want to know what is next |
