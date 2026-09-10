# @nxgt/security

A YAML/JSON rules engine for REST and GraphQL. The core (`policy`) is
framework-agnostic; Hono and GraphQL glue live on their own subpaths so a
REST-only consumer never pulls `graphql`.

```ts
import { loadRulesFromEnv, evaluateRest } from '@nxgt/security/policy';

const policy = await loadRulesFromEnv({ envVar: 'RULES_FILE' });
const result = await evaluateRest(policy, {
	type: 'rest',
	method: 'GET',
	path: '/bookmarks/123',
	claims: { sub: 'user-1' },
});
```

Most Hono services never call the evaluator themselves:
`policyGuard` from `@nxgt/security/integrations/hono` wraps it.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/security` | re-exports `policy` |
| `@nxgt/security/policy` | parse, compile, `evaluateRest` / `evaluateGraphql` |
| `@nxgt/security/policy/graphql` | `applyGraphqlPolicy` — wrap a schema's resolvers |
| `@nxgt/security/integrations/hono` | `policyGuard` |
| `@nxgt/security/integrations/ory` | `claimsFromOryPrincipal` — the one mapper |
| `@nxgt/security/integrations/hono/keto` | `ketoPermissions()` for REST |
| `@nxgt/security/integrations/graphql/keto` | `ketoPermissions()` for GraphQL |

The JSON Schema ships in `schema/rules.schema.json` (named in `files`). Point a
`$schema` pragma at it from a consumer's `rules.yaml`.

## Things that bite

- **`authorities` and `keto` nest in opposite directions.** `authorities` is
  outer AND, inner OR. `keto[].permissions` is outer OR, inner AND — the same
  grammar as `@check` and `ketoCheck()`. Aligning them would silently change
  what an existing `authorities` line means.
- **`permissions: []` admits nobody; `permissions: [[]]` admits everyone.**
  Both are refused at parse time.
- **`param.` reads the pattern in the rules file, not the Hono route.**
  `/bookmarks/:bookmarkId` does not give you `param.id`. REST ids are
  `param.` / `query.` / `json.`; GraphQL ids are `args.` / `source.`. The
  wrong grammar on the wrong side fails at startup.
- **`global.unmatched: deny` is REST-only.** Compiling a document that also
  has a `graphql:` block throws rather than closing half of it in silence. A
  path no rule names is otherwise **open**.
- **`keto` without an evaluator throws**, it is never an allow. Import
  `ketoPermissions` from the matching integrations subpath and pass it in.
  `stx-sdk` is an optional peer of those subpaths only.
- **`global.rateLimit`, `global.cors` and `global.providers` validate and go
  nowhere.** Real CORS and rate-limiting still live in each app's middleware.
- **Both evaluators are `async` since 3.0.0** — a `keto` term is a remote
  question. `claimsFromOryPrincipal` is the one mapper; do not rebuild
  `PolicyClaims` in the middleware.

## Install

```bash
bun add @nxgt/security
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
