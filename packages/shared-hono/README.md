# @nxgt/shared-hono

The Hono application layer: app factory, error handler, auth and rate-limit
middleware, the typed `openapi-fetch` client, and an MCP server integration.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-hono` | the app factory, middleware and error handler |
| `@nxgt/shared-hono/openapi-fetch` | the typed REST client |
| `@nxgt/shared-hono/mcp` | Model Context Protocol server wiring |

The error handler answers with `CustomException.code` as the HTTP status — that
is the contract that keeps `code` numeric in `@nxgt/shared-exceptions`.

`stx-sdk` is a peer, because the OAuth types come from it. It is public on
npmjs, so an install resolves it without any extra configuration.

## Ory-native routes: `requireAuthenticated` and `ketoCheck`

`oryAuth(ory)` authenticates and stops there — an anonymous caller reaches
`next()`, because authenticating is not deciding. Two middlewares decide:

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

## Install

```bash
bun add @nxgt/shared-hono
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
