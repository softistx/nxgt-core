# @nxgt/shared-hono

The Hono application layer: error handler, auth and rate-limit middleware, the
typed `openapi-fetch` client, and an MCP server integration.

## Install

```bash
bun add @nxgt/shared-hono
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it. `stx-sdk` is a peer too, because the OAuth types come from it;
it is public on npmjs.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-hono` | middleware, error handler, env |
| `@nxgt/shared-hono/openapi-fetch` | the typed REST client (`export *` of `openapi-fetch` plus the default factory) |
| `@nxgt/shared-hono/mcp` | Model Context Protocol server wiring (`createMcpServerApp`) |

The error handler answers with `CustomException.code` as the HTTP status — that
is the contract that keeps `code` numeric in `@nxgt/shared-exceptions`.

## Error handler

```ts
import { createErrorHandler } from '@nxgt/shared-hono';
import { translate } from '@nxgt/i18n';

app.onError(createErrorHandler(translate));
```

`CustomException` becomes `{ status, message, debugMessage, timestamp }` with
`message` translated. `HTTPException` is forwarded. Anything else is a 500.

## Auth

Two worlds, both first-class.

**Gateway headers** — sellix's services. `currentUser()` builds a `Principal`
from `USER_HEADERS` (`X-User-Id`, …). `secured([['ADMIN'], ['users:read']])`
is Apollo-federation `requireScopes` semantics: outer AND, inner OR.
Confidential clients (a `clientId` and no `username`) only match `SCOPE_*`.

**Ory-native** — federation's services. `oryAuth(ory)` authenticates and stops
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

`ketoCheck` takes the same `[[ ]]` grammar as the `@check` directive in
`@nxgt/shared-graphql`, and the same evaluator from `stx-sdk/ory`: **outer list
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

`openfetchServiceUser()` is `openapi-fetch` middleware that copies the current
`USER_HEADERS` context onto outbound REST calls, so a GraphQL resolver talking
to a REST service forwards the same principal the gateway set.

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
entry. See AGENTS.md.

## MCP

`@nxgt/shared-hono/mcp` re-exports `@modelcontextprotocol/{hono,server}` (again,
from the entry point) and `createMcpServerApp(server)`. The helper introspects
the caller's bearer token through `stx-sdk/auth` before handing the request to
the MCP transport.

## Things that bite

- **`secured` and `ketoCheck` nest in opposite directions.** `secured` is
  outer AND, inner OR (authorities). `ketoCheck` is outer OR, inner AND
  (permissions). The same shape as `@policy` vs `@check`.
- **`openfetchServiceUser` reads the Hono context at construction.** Call it
  inside a request (or from `tryGetContext()`-aware code), not at module
  scope, or it captures an empty context forever.
