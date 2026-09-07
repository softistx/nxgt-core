# @nxgt/security

Home for cross-cutting security features shared across services. Each feature lives in its own subfolder under `src/` with its own barrel and its own package subpath export — new features should be added the same way rather than dropped into the package root.

Framework-specific glue code (e.g. wiring the policy engine into a Hono app) lives under `src/integrations/<framework>/` instead of inside the feature itself, so the core engine (`policy`) stays framework-agnostic and dependency-light — only consumers who actually import an integration subpath pull in that framework and any monorepo-shared packages it needs (`@nxgt/shared`, `@nxgt/shared-exceptions`, `@nxgt/shared-logging`, `hono`, ...).

## Features

### `policy` (`@nxgt/security/policy`)

A framework-agnostic authorization/policy-evaluation engine for REST and GraphQL requests, driven by a YAML/JSON rules document validated with Zod.

This package supersedes `@nxgt/shared/policy`, which has been removed — update any remaining `@nxgt/shared/policy` imports to `@nxgt/security/policy`.

**Usage:**

```ts
import { loadRulesFromEnv, evaluateRest } from '@nxgt/security/policy';

// Reads the file at RULES_FILE (or "rules.yaml", relative to the process's
// working directory, if unset), validates it, and precompiles it — once at
// startup. Reading from disk (rather than bundling the file into the build)
// means ops can change the rules file and restart, without a rebuild.
const policy = await loadRulesFromEnv({
	envVar: 'RULES_FILE',
	fallbackPath: 'rules.yaml',
});

const result = await evaluateRest(policy, {
	type: 'rest',
	method: 'GET',
	path: '/users/123',
	claims: { sub: 'user-1', authorities: ['ADMIN'] },
});
// result.decision: 'ALLOW' | 'DENY' | 'NOT_APPLICABLE' | 'UNAUTHENTICATED'
```

`evaluateRest` is **async** since 2.0.0, because a rule may carry a `keto` term and that is a remote question. `evaluateGraphql` stays synchronous — no Keto term is accepted there (see below).

`loadRulesFromEnv`/`loadRulesFromFile` are convenience wrappers around `parseRules(raw)` (itself `compilePolicy(RulesSchema.parse(raw))`) — use `parseRules` directly if you already have the raw rules data in memory (e.g. a static import, or a value read some other way). Each also has a `loadRaw*` counterpart (`loadRawRulesFromEnv`/`loadRawRulesFromFile`) that validates but doesn't compile — for callers that need the raw document itself, e.g. `policyGuard`/`applyGraphqlPolicy` (see below), which compile it internally. See `src/policy/load-rules.ts`.

Most Hono services won't call this directly — `@nxgt/security/integrations/hono`'s `policyGuard(policy)` middleware wraps `evaluateRest` for you; see the `integrations/hono` section below.

**Rules document shape:** REST rules are keyed by path pattern first, then by HTTP method (`rest./users/:id.GET`, not `rest.GET./users/:id`) — mirroring the OpenAPI `paths` object. Path patterns are arbitrary and can't be enumerated, so that level stays an open dictionary; but each path's methods are still explicit object properties (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `CONNECT`, `TRACE`, `QUERY`), which is what lets editors autocomplete method names. GraphQL rules are keyed by type name first, then field name: `Query`, `Mutation`, and `Subscription` are explicit properties (autocompleted), but any other GraphQL object type is also accepted (e.g. `User`, `Employee`) so rules can target fields on nested/returned types, not just root operation fields. See `src/policy/rules.schema.ts`, or open any of the real rules files (`apps/gateway/security/auth.yaml`, `apps/oauth/oauth-api/rules.yaml`, `apps/storex/storex-api/rules.yaml`) in an editor with the YAML language server extension — each carries a `$schema` pragma pointing at `node_modules/@nxgt/security/schema/rules.schema.json`, so field docs and autocompletion show up while editing. That file **ships** — it is in `files` — because a consumer can only point a pragma at a path it actually has; while this package lived inside the consuming monorepo the pragmas pointed at its source tree, and after the extraction to nxgt-core those paths resolved to nothing.

Within a given path's method map (or a given GraphQL type's field list), matching is first-match-wins in document order — more specific literal path patterns must be declared before overlapping `:param` ones. Note that a typo'd root GraphQL type name (e.g. `Qeury`) can't be caught at parse time, unlike REST HTTP methods — it's indistinguishable from a legitimate custom type name once arbitrary type names are allowed.

**Declarative-only fields:** `global.rateLimit`, `global.cors`, `global.providers`, and the per-rule `cors`/`rateLimit` overrides on any REST or GraphQL rule entry are schema-only today — they validate and round-trip, but no evaluator in this package reads or enforces them. Real CORS/rate-limiting still lives in each app's own middleware (e.g. `@nxgt/shared-hono`'s `rateLimiter()`). Treat these fields as reserved for a future enforcement pass, not as live configuration.

**`expression.value` isn't member-completable** — it's an arbitrary JS string, so a JSON Schema can't offer real completion of e.g. `claims.` → `roles`/`scope` the way it does for structural keys. It does carry a curated `examples` array (via Zod's `.meta({ examples: [...] })`), which `vscode-yaml` surfaces as value-choice suggestions when you start typing that field — a starting point to adapt, not live semantic completion.

**Per-object permissions: the `keto` term.** `authorities` asks what the caller *carries*. It cannot ask what an Ory-native API needs to know — **may this caller `view` `Bookmark:b1`** — a question about one object, answered by Keto. That is what `keto` adds, in the same grammar as the `@check` directive and `ketoCheck()`, so one permission reads identically wherever it is declared:

```yaml
rest:
  /bookmarks/:id:
    GET:
      keto:
        - permissions: [[{ namespace: Bookmark, permit: view, id: param.id }]]
          message: bookmarks.errors.not-found
    PATCH:
      # Two rungs, in order — this is the 404-then-403 ladder, not a
      # redundancy: a stranger is told it is not there, a viewer who tries to
      # write is told they may not.
      keto:
        - permissions: [[{ namespace: Bookmark, permit: view, id: param.id }]]
          message: bookmarks.errors.not-found
        - permissions: [[{ namespace: Bookmark, permit: edit, id: param.id }]]
          onDeny: FORBIDDEN
```

A `keto` list is evaluated **last** — after the authentication floor, `authorities` and `expression`, all of which are local and synchronous. There is no reason to cross the network for a question already answerable here.

The two nestings in a rule are **opposite**, and deliberately so:

| field | outer list | inner list | grammar shared with |
| --- | --- | --- | --- |
| `authorities` | AND | OR | — (this package only) |
| `keto[].permissions` | **OR** | **AND** | `@check`, `ketoCheck()`, `@policy` |

Aligning them would mean changing what an existing `authorities` line means, silently, in three rules files already in production. They do not get confused in practice: an authority is a **string**, a permission term is an **object**, and the schema refuses one where the other belongs.

Two things the schema refuses outright, both at parse time with a message that names the key: `permissions: []` (a disjunction satisfied by nothing — admits nobody) and `permissions: [[]]` (a conjunction over no terms is vacuously true — **admits everyone**, while reading like "no permission needed"). `id` must be `param.<name>`, `query.<name>` or `json.<path>`; `args.`/`source.` are the GraphQL grammar and are rejected.

**`param.` reads the pattern in the rules file, not the app's route.** The captures come from the path pattern this document declares. A file that says `/bookmarks/:bookmarkId` does not give you `param.id`, however the Hono route is spelled — and when a `ketoCheck()` on the same route says `param.id`, that is exactly how the two rails come to disagree in silence. Read the pattern and the term together.

**`keto` is a REST-only field.** It is declared on the REST rule entry, not the shared one, because `evaluateGraphql` honours no Keto term — a field on the shared entry would be advertised by the generated JSON Schema under `graphql:`, autocompleted, accepted by the parser and then ignored. GraphQL rule entries are `.strict()`, so a `keto` key that wanders into one fails at startup naming itself.

**A path no rule names is still open.** `NOT_APPLICABLE` means open, and adding `keto` terms does not change that — a file that decides per object *looks* more complete than it is. Mount the guard on a prefix (`app.use('/api/*', …)`), never per route, and keep whatever answers the authentication floor.

Run `bun run schema:gen` after changing `rules.schema.ts` to regenerate that checked-in JSON Schema file (`schema/rules.schema.json`).

### `policy/graphql` (`@nxgt/security/policy/graphql`)

A separate subpath, layered on top of `policy`, for wrapping a real executable GraphQL schema's resolvers with the rules in `rules.graphql`. Not re-exported from `@nxgt/security/policy` — importing it pulls in `graphql` and `@graphql-tools/utils`, which REST-only consumers of the base `policy` subpath don't need.

```ts
import { loadRawRulesFromEnv } from '@nxgt/security/policy';
import { applyGraphqlPolicy } from '@nxgt/security/policy/graphql';
import { schema as rawSchema } from './schema'; // your executable GraphQLSchema

const rawRules = await loadRawRulesFromEnv({ envVar: 'RULES_FILE', fallbackPath: 'rules.yaml' });

const schema = applyGraphqlPolicy(rawSchema, rawRules, {
	// Context shape is server-specific (Yoga, Apollo, Mercurius, ...), so the
	// caller always supplies the extractor rather than a fixed convention.
	getClaims: (context) => (context as { claims: PolicyClaims }).claims,
});

// Serve `schema` instead of `rawSchema`.
```

`applyGraphqlPolicy` only accepts a raw/unvalidated rules document (never a pre-compiled `CompiledPolicy`) — it validates and compiles it internally, once, at the point `applyGraphqlPolicy(...)` is called, not per request.

For every `typeName.fieldName` covered by a rule — root fields under `Query`/`Mutation`/`Subscription`, or a field on any other declared type (e.g. `User.email`) — the resolver is replaced with a wrapper that runs the same authorities + expression check as `evaluateGraphql`, delegating to the original resolver (or `defaultFieldResolver`, if none was set) on ALLOW, and throwing a `GraphQLError` (`extensions.code: 'FORBIDDEN'`) on DENY. Fields with no rule entry are left completely untouched — the original schema is never mutated, `applyGraphqlPolicy` returns a new one via `@graphql-tools/utils`'s `mapSchema`.

GraphQL expressions see `claims`, `args`, `source` (the resolver's parent/source value — e.g. `source.id === claims.sub` for an ownership check on `User.email`), and `info` (the full `GraphQLResolveInfo`) in scope.

**Non-null fields — partial-results safety:** per the GraphQL spec, a resolver error on a non-null field (`String!`, `ID!`, ...) can't just null that field — it propagates to the nearest nullable ancestor, which can wipe out unrelated sibling data (or the whole response) on a single DENY. `applyGraphqlPolicy` defaults to `strict: true`: it throws `NonNullRuleFieldError` at wrap time (schema/server startup, not per-request) for any rule-covered field whose type is non-null, so this surfaces immediately rather than as a confusing null response in production. Fix it by marking the field nullable in the schema, or pass `strict: false` to `applyGraphqlPolicy` to acknowledge the cascade and proceed anyway.

`mapSchema` operates on a standard `graphql-js` `GraphQLSchema` object, so this works regardless of which server framework built or serves it (Yoga, Apollo, Mercurius, a hand-rolled `makeExecutableSchema` call, ...) — no GraphQL server library is a dependency of this package.

## Integrations

### `integrations/hono` (`@nxgt/security/integrations/hono`)

`policyGuard(rawRules)` — a Hono middleware wrapping `evaluateRest`. Moved here from `@nxgt/shared-hono` so REST policy enforcement lives next to the engine it wraps, in the package whose whole purpose is being the home for security features.

```ts
import { loadRawRulesFromEnv } from '@nxgt/security/policy';
import { policyGuard } from '@nxgt/security/integrations/hono';

const rawRules = await loadRawRulesFromEnv({ envVar: 'RULES_FILE', fallbackPath: 'rules.yaml' });
app.use('/api/*', bearerAuth(), policyGuard(rawRules));
```

Like `applyGraphqlPolicy`, `policyGuard` only accepts a raw/unvalidated rules document (never a pre-compiled `CompiledPolicy`) — it compiles internally, once, when `policyGuard(...)` is called, not per request. If a service also needs a `CompiledPolicy` for direct `evaluateRest`/`evaluateGraphql` calls elsewhere (e.g. a policy dry-run endpoint), load the raw document once and derive both: `const rawRules = await loadRawRulesFromEnv(...); const policy = compilePolicy(rawRules);` — see `apps/oauth/oauth-api/src/modules/policies/rules.loader.ts` for a real example.

Must run after the token-resolution middleware (`bearerAuth`/`currentUser`/`oryAuth`/...) that populates the `USER_HEADERS` context variables it reads claims from — **context variables, not request headers**, so nothing a client sends can reach the decision directly. A proxy in front changes none of this: an Ory-native API behind Ory Oathkeeper still runs `oryAuth()`, which verifies the edge's signed token and then sets the same `X-Claims` context variable this guard reads. Note also that Oathkeeper's own `access_rules` document is a **different engine** that never reads these rules files and is never read by them; the two must be kept in agreement by hand (see nxgt-ory's `docs/oathkeeper.md`). On DENY it throws a 403 `CustomException` — or a 404 when the refusal came from a `keto` rung declaring `onDeny: NOT_FOUND`; on ALLOW/NOT_APPLICABLE it calls `next()`. This subpath (unlike the base `policy` subpath) depends on `@nxgt/shared`, `@nxgt/shared-exceptions`, `@nxgt/shared-logging`, and `hono` — consumers that never import `@nxgt/security/integrations/hono` never pull those in.

### `integrations/hono/keto` (`@nxgt/security/integrations/hono/keto`)

`ketoPermissions()` — what a rules file's `keto` terms need in order to be answerable. It is its **own entrypoint**, and it is the only module in this package that imports `stx-sdk`:

```ts
import { policyGuard } from '@nxgt/security/integrations/hono';
import { ketoPermissions } from '@nxgt/security/integrations/hono/keto';

app.use('*', oryAuth(ory), oryChecks(ory));
app.use('/api/*', requireAuthenticated(), policyGuard(rawRules, { permissions: ketoPermissions() }));
```

It reads two things `@nxgt/shared-hono` already puts on the context — `ory.subject` from `oryAuth()`, and the per-request `ketoChecks` `DataLoader` from `oryChecks(ory)`, which must therefore be mounted **before** the guard. That loader is what makes a second rail free: it memoises by Keto's own `Bookmark:b1#view@idn-7` notation, so the same question asked by the rules file and again by a `ketoCheck()` on the route costs one round trip between them.

The DNF walk itself is `evaluateRequirement` from `stx-sdk/ory`, not a copy — so the rules file, the `@check` directive and `ketoCheck()` cannot come to disagree about what `[[A, B], [C]]` means.

`stx-sdk` is an **optional** peer dependency for exactly this reason: a service whose rules file has no `keto` term never imports this subpath, so it never has to install it. The gateway, oauth-api and storex-api authenticate with oauth-api JWTs and will never ask Keto anything.

A rule that carries a `keto` term with no evaluator supplied **throws**; it is never an allow. Wiring that is missing should fall over on the first request, loudly.

## Development

```bash
bun install
bun run typecheck
bun test
```

## Install

```bash
bun add @nxgt/security
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package.
