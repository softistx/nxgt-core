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

**Rules document shape:** see `src/policy/rules.schema.ts`, or open any of the real rules files (`apps/gateway/security/auth.yaml`, `apps/oauth/oauth-api/rules.yaml`, `apps/storex/storex-api/rules.yaml`) in an editor with the YAML language server extension — each carries a `$schema` pragma pointing at `src/policy/schema/rules.schema.json`, so field docs and autocompletion show up while editing.

Run `bun run schema:gen` after changing `rules.schema.ts` to regenerate that checked-in JSON Schema file.

## Development

```bash
bun install
bun run typecheck
bun test
```
