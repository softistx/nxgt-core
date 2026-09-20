# @nxgt/shared

The foundation layer: domain types, the two principal shapes, helpers, mail and
scheduling, and the caching middleware. Everything above it in the layering
depends on it, so it depends on as little as possible — `@nxgt/shared-events`
and `@nxgt/shared-logging` only.

## Install

```bash
bun add @nxgt/shared
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared` | the aggregate surface (events core, logging, caching, consts, helpers, models, types) |
| `@nxgt/shared/helpers` | string, object, date, jwt, pkce, password, redis, pagination, sort, … |
| `@nxgt/shared/models` | domain models and their Zod schemas (`Principal`, filters, events, user) |
| `@nxgt/shared/types` | `TokenPrincipal`, mailer, path and permission types |
| `@nxgt/shared/caching` | the HTTP cache middleware |

The root re-exports `@nxgt/shared-events/core` and `@nxgt/shared-logging`.
Import a subpath when you want one surface and not the others.

## Two principals, on purpose

`Principal` (from `@nxgt/shared/models`, also on the root) is the caller as the
gateway's `X-User-*` headers describe them — `id`, `username`, `authorities`.
`USER_HEADERS` is the header map that middleware reads to build it.

`TokenPrincipal` (from `@nxgt/shared/types`) is the caller as an access token
describes them — `sub`, `uid`, `scope`, `roles`.

They are different sets of fields from different sources, and both are in
production: sellix's services read the first, federation's the second. Do not
"unify" them. A class that reads more than `name` says which one it means
through a type parameter (`MongoCrudService<…, TokenPrincipal>`).

This is also the one package that may `import … from 'mongoose'` directly: it
declares mongoose itself and is the layer `@nxgt/shared-mongo` builds on.
Everywhere else, mongoose comes from `@nxgt/shared-mongo`.

## Helpers

`@nxgt/shared/helpers` is the kitchen drawer. The names that have bitten
people:

| Helper | What it is for |
| --- | --- |
| `toObjectId` / `toObjectIds` | convert a string to an ObjectId |
| `cleanObject` / `omit` | strip undefined before a Mongo write |
| `isScopeAuthority` | SCOPE_* vs role/permission, for confidential clients |
| `buildSort` / `SortDirection` | REST sort vocabulary — not the GraphQL one in `@nxgt/shared-mongo/filters` |

## Things that bite

- **`Principal` and `TokenPrincipal` are not aliases.** Importing the wrong
  one typechecks until you read `id` vs `uid`.
- **The root re-exports logging.** Importing `@nxgt/shared` constructs the
  default `logger` and therefore needs `logs/` to exist. Import
  `@nxgt/shared/helpers` or `@nxgt/shared/types` when you do not want that.
