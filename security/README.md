# @nxgt/security

Home for cross-cutting security features shared across services. Each feature lives in its own subfolder under `src/` with its own barrel and its own package subpath export — new features should be added the same way rather than dropped into the package root.

## Features

### `policy` (`@nxgt/security/policy`)

A framework-agnostic authorization/policy-evaluation engine for REST and GraphQL requests, driven by a YAML/JSON rules document validated with Zod.

This package supersedes `@nxgt/shared/policy`, which has been removed — update any remaining `@nxgt/shared/policy` imports to `@nxgt/security/policy`.

**Usage:**

```ts
import { compilePolicy, RulesSchema, evaluateRest } from '@nxgt/security/policy';
import rawRules from './rules.yaml';

// Parse + precompile once at startup — path matchers and expression
// Functions are compiled here, not on every request.
const policy = compilePolicy(RulesSchema.parse(rawRules));

const result = evaluateRest(policy, {
	type: 'rest',
	method: 'GET',
	path: '/users/123',
	claims: { sub: 'user-1', authorities: ['ADMIN'] },
});
// result.decision: 'ALLOW' | 'DENY' | 'NOT_APPLICABLE'
```

Most services won't call this directly — `@nxgt/shared-hono`'s `policyGuard(policy)` Hono middleware wraps `evaluateRest` for you; see `packages/shared-hono/src/middlewares/policy-guard.ts`.

**Rules document shape:** REST rules are keyed by path pattern first, then by HTTP method (`rest./users/:id.GET`, not `rest.GET./users/:id`) — mirroring the OpenAPI `paths` object. Path patterns are arbitrary and can't be enumerated, so that level stays an open dictionary; but each path's methods are still explicit object properties (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `CONNECT`, `TRACE`, `QUERY`), which is what lets editors autocomplete method names. GraphQL rules are keyed by operation type first (`Query`, `Mutation`, `Subscription`, also explicit properties), then field name. See `src/policy/rules.schema.ts`, or open any of the real rules files (`apps/gateway/security/auth.yaml`, `apps/oauth/oauth-api/rules.yaml`, `apps/storex/storex-api/rules.yaml`) in an editor with the YAML language server extension — each carries a `$schema` pragma pointing at `src/policy/schema/rules.schema.json`, so field docs and autocompletion show up while editing.

Within a given path's method map (or a given GraphQL operation type's field list), matching is first-match-wins in document order — more specific literal path patterns must be declared before overlapping `:param` ones.

**Declarative-only fields:** `global.rateLimit`, `global.cors`, `global.providers`, and the per-rule `cors`/`rateLimit` overrides on any REST or GraphQL rule entry are schema-only today — they validate and round-trip, but no evaluator in this package reads or enforces them. Real CORS/rate-limiting still lives in each app's own middleware (e.g. `@nxgt/shared-hono`'s `rateLimiter()`). Treat these fields as reserved for a future enforcement pass, not as live configuration.

Run `bun run schema:gen` after changing `rules.schema.ts` to regenerate that checked-in JSON Schema file.

## Development

```bash
bun install
bun run typecheck
bun test
```
