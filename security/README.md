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

**Rules document shape:** REST rules are keyed by path pattern first, then by HTTP method (`rest./users/:id.GET`, not `rest.GET./users/:id`) — mirroring the OpenAPI `paths` object. Path patterns are arbitrary and can't be enumerated, so that level stays an open dictionary; but each path's methods are still explicit object properties (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `CONNECT`, `TRACE`, `QUERY`), which is what lets editors autocomplete method names. GraphQL rules are keyed by type name first, then field name: `Query`, `Mutation`, and `Subscription` are explicit properties (autocompleted), but any other GraphQL object type is also accepted (e.g. `User`, `Employee`) so rules can target fields on nested/returned types, not just root operation fields. See `src/policy/rules.schema.ts`, or open any of the real rules files (`apps/gateway/security/auth.yaml`, `apps/oauth/oauth-api/rules.yaml`, `apps/storex/storex-api/rules.yaml`) in an editor with the YAML language server extension — each carries a `$schema` pragma pointing at `src/policy/schema/rules.schema.json`, so field docs and autocompletion show up while editing.

Within a given path's method map (or a given GraphQL type's field list), matching is first-match-wins in document order — more specific literal path patterns must be declared before overlapping `:param` ones. Note that a typo'd root GraphQL type name (e.g. `Qeury`) can't be caught at parse time, unlike REST HTTP methods — it's indistinguishable from a legitimate custom type name once arbitrary type names are allowed.

**Declarative-only fields:** `global.rateLimit`, `global.cors`, `global.providers`, and the per-rule `cors`/`rateLimit` overrides on any REST or GraphQL rule entry are schema-only today — they validate and round-trip, but no evaluator in this package reads or enforces them. Real CORS/rate-limiting still lives in each app's own middleware (e.g. `@nxgt/shared-hono`'s `rateLimiter()`). Treat these fields as reserved for a future enforcement pass, not as live configuration.

**`expression.value` isn't member-completable** — it's an arbitrary JS string, so a JSON Schema can't offer real completion of e.g. `claims.` → `roles`/`scope` the way it does for structural keys. It does carry a curated `examples` array (via Zod's `.meta({ examples: [...] })`), which `vscode-yaml` surfaces as value-choice suggestions when you start typing that field — a starting point to adapt, not live semantic completion.

Run `bun run schema:gen` after changing `rules.schema.ts` to regenerate that checked-in JSON Schema file.

### `policy/graphql` (`@nxgt/security/policy/graphql`)

A separate subpath, layered on top of `policy`, for wrapping a real executable GraphQL schema's resolvers with the rules in `rules.graphql`. Not re-exported from `@nxgt/security/policy` — importing it pulls in `graphql` and `@graphql-tools/utils`, which REST-only consumers of the base `policy` subpath don't need.

```ts
import { applyGraphqlPolicy, compilePolicy, RulesSchema } from '@nxgt/security/policy/graphql';
import rawRules from './rules.yaml';
import { schema as rawSchema } from './schema'; // your executable GraphQLSchema

const policy = compilePolicy(RulesSchema.parse(rawRules));

const schema = applyGraphqlPolicy(rawSchema, policy, {
	// Context shape is server-specific (Yoga, Apollo, Mercurius, ...), so the
	// caller always supplies the extractor rather than a fixed convention.
	getClaims: (context) => (context as { claims: PolicyClaims }).claims,
});

// Serve `schema` instead of `rawSchema`.
```

For every `typeName.fieldName` covered by a rule — root fields under `Query`/`Mutation`/`Subscription`, or a field on any other declared type (e.g. `User.email`) — the resolver is replaced with a wrapper that runs the same authorities + expression check as `evaluateGraphql`, delegating to the original resolver (or `defaultFieldResolver`, if none was set) on ALLOW, and throwing a `GraphQLError` (`extensions.code: 'FORBIDDEN'`) on DENY. Fields with no rule entry are left completely untouched — the original schema is never mutated, `applyGraphqlPolicy` returns a new one via `@graphql-tools/utils`'s `mapSchema`.

GraphQL expressions see `claims`, `args`, `source` (the resolver's parent/source value — e.g. `source.id === claims.sub` for an ownership check on `User.email`), and `info` (the full `GraphQLResolveInfo`) in scope.

**Non-null fields — partial-results safety:** per the GraphQL spec, a resolver error on a non-null field (`String!`, `ID!`, ...) can't just null that field — it propagates to the nearest nullable ancestor, which can wipe out unrelated sibling data (or the whole response) on a single DENY. `applyGraphqlPolicy` defaults to `strict: true`: it throws `NonNullRuleFieldError` at wrap time (schema/server startup, not per-request) for any rule-covered field whose type is non-null, so this surfaces immediately rather than as a confusing null response in production. Fix it by marking the field nullable in the schema, or pass `strict: false` to `applyGraphqlPolicy` to acknowledge the cascade and proceed anyway.

`mapSchema` operates on a standard `graphql-js` `GraphQLSchema` object, so this works regardless of which server framework built or serves it (Yoga, Apollo, Mercurius, a hand-rolled `makeExecutableSchema` call, ...) — no GraphQL server library is a dependency of this package.

## Development

```bash
bun install
bun run typecheck
bun test
```
