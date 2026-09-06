# @nxgt/shared

The foundation layer: domain types, the two principal shapes, helpers, mail and
scheduling, and the caching middleware. Everything above it in the layering
depends on it, so it depends on as little as possible — `@nxgt/shared-events`
and `@nxgt/shared-logging` only.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared` | the aggregate surface |
| `@nxgt/shared/helpers` | string, object, date and id helpers |
| `@nxgt/shared/models` | domain models and their Zod schemas |
| `@nxgt/shared/types` | shared type declarations |
| `@nxgt/shared/caching` | the HTTP cache middleware |

## Two principals, on purpose

`Principal` is the caller as the gateway's `X-User-*` headers describe them —
`id`, `username`, `authorities`. `TokenPrincipal` is the caller as an access
token describes them — `sub`, `uid`, `scope`, `roles`. They are different sets
of fields from different sources, and both are in production: sellix's services
read the first, federation's the second. Do not "unify" them.

This is also the one package that may `import … from 'mongoose'` directly: it
declares mongoose itself and is the layer `@nxgt/shared-mongo` builds on.
Everywhere else, mongoose comes from `@nxgt/shared-mongo`.

## Install

```bash
bun add @nxgt/shared
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
