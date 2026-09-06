# @nxgt/shared-graphql

The GraphQL layer: Yoga + Hono wiring, the federation subgraph builder, shared
scalars and directives, dataloaders, subscriptions over Redis, upload handling,
and the SDL every service merges into its own schema.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-graphql` | server wiring, scalars, utils, context types |
| `@nxgt/shared-graphql/security` | the `@policy` directive and its validation |

## The shared SDL ships in `graphql/`, not in `dist/`

`bun build` bundles code and nothing else, so the `.graphqls` files live in
their own published directory. Point your codegen and your schema loader at
**`SHARED_SCHEMA_PATH`**, which this package resolves against its own root:

```ts
import { loadTypeDefs, SCALAR_RESOLVERS, SHARED_SCHEMA_PATH } from '@nxgt/shared-graphql';

const typeDefs = loadTypeDefs(SHARED_SCHEMA_PATH, join(__dirname, '../**/*.graphqls'));
```

```ts
// codegen.ts
import { SCALARS_MAPPING, SHARED_SCHEMA_PATH } from '@nxgt/shared-graphql';

schema: ['./src/**/*.graphqls', SHARED_SCHEMA_PATH],
```

A relative path into this package's `src/` will not work from an install — it
is not published, and it was not there in the first place.

## The context is a `TokenPrincipal`

`GraphQLBaseContext.user` is `TokenPrincipal` — the caller as the access token
describes them (`sub`, `uid`, `scope`). It is not `Principal`, which is the
header-derived shape used by the REST services.

`stx-sdk` is a peer, public on npmjs.

## Install

```bash
bun add @nxgt/shared-graphql
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
