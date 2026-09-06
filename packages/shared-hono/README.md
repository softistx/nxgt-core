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

## Install

```bash
bun add @nxgt/shared-hono
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
