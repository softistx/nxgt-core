# @nxgt/security

A YAML/JSON rules engine for REST and GraphQL. The core (`policy`) is
framework-agnostic; Hono and GraphQL glue live on their own subpaths so a
REST-only consumer never pulls `graphql`. This package supersedes
`@nxgt/shared/policy`, which has been removed.

## Install

```bash
bun add @nxgt/security
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.

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
`$schema` pragma at `node_modules/@nxgt/security/schema/rules.schema.json` from
a consumer's `rules.yaml`. Run `bun run schema:gen` after changing
`rules.schema.ts` to regenerate it.

## Policy engine (`@nxgt/security/policy`)

```ts
import { loadRulesFromEnv, evaluateRest } from '@nxgt/security/policy';

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

Reads the file at `RULES_FILE` (or `rules.yaml`, relative to the process
working directory), validates it, and precompiles it — once at startup. Ops
can change the file and restart, without a rebuild.

**Both evaluators are `async` since 3.0.0**, because a rule may carry a `keto`
term and that is a remote question.

`loadRulesFromEnv` / `loadRulesFromFile` wrap `parseRules(raw)` (itself
`compilePolicy(RulesSchema.parse(raw))`) — use `parseRules` if you already
have the raw document. Each also has a `loadRaw*` counterpart that validates
but does not compile, for callers such as `policyGuard` / `applyGraphqlPolicy`
that compile internally.

Most Hono services never call the evaluator themselves:
`policyGuard` from `@nxgt/security/integrations/hono` wraps it.

### Rules document

REST rules are keyed by path pattern first, then by HTTP method
(`rest./users/:id.GET`, not `rest.GET./users/:id`) — mirroring the OpenAPI
`paths` object. Path patterns are an open dictionary; each path's methods are
explicit properties (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`,
`OPTIONS`, `CONNECT`, `TRACE`, `QUERY`), which is what lets editors
autocomplete method names.

GraphQL rules are keyed by type name first, then field name: `Query`,
`Mutation`, and `Subscription` are explicit; any other GraphQL object type is
also accepted (`User`, `Employee`) so rules can target fields on returned
types, not just root operations. A typo'd root type (`Qeury`) cannot be caught
at parse time — it is indistinguishable from a legitimate custom type.

Within a path's method map (or a GraphQL type's field list), matching is
first-match-wins in document order — more specific literal patterns must be
declared before overlapping `:param` ones.

**Declarative-only fields:** `global.rateLimit`, `global.cors`,
`global.providers`, and the per-rule `cors` / `rateLimit` overrides validate
and round-trip, but no evaluator in this package reads them. Real CORS and
rate-limiting still live in each app's middleware (e.g.
`@nxgt/shared-hono`'s `rateLimiter()`). Treat them as reserved, not live
configuration.

**`expression.value` is an arbitrary JS string**, so JSON Schema cannot offer
real completion of `claims.` → `roles` / `scope`. It carries a curated
`examples` array that `vscode-yaml` surfaces as value-choice suggestions.

### Per-object permissions: `keto`

`authorities` asks what the caller *carries*. It cannot ask what an Ory-native
API needs to know — **may this caller `view` `Bookmark:b1`**. That is what
`keto` adds, in the same grammar as `@check` and `ketoCheck()`:

```yaml
rest:
  /bookmarks/:id:
    GET:
      keto:
        - permissions: [[{ namespace: Bookmark, permit: view, id: param.id }]]
          message: bookmarks.errors.not-found
    PATCH:
      keto:
        - permissions: [[{ namespace: Bookmark, permit: view, id: param.id }]]
          message: bookmarks.errors.not-found
        - permissions: [[{ namespace: Bookmark, permit: edit, id: param.id }]]
          onDeny: FORBIDDEN
```

The GraphQL half reads the same, on a field instead of a route:

```yaml
graphql:
  Mutation:
    updateNote:
      keto:
        - permissions: [[{ namespace: Note, permit: view, id: args.id }]]
          message: notes.errors.not-found
        - permissions: [[{ namespace: Note, permit: edit, id: args.id }]]
          onDeny: FORBIDDEN
```

A `keto` list is evaluated **last** — after the authentication floor,
`authorities` and `expression`, all of which are local and synchronous.

The two nestings in a rule are **opposite**, and deliberately so:

| field | outer list | inner list | grammar shared with |
| --- | --- | --- | --- |
| `authorities` | AND | OR | — (this package only) |
| `keto[].permissions` | **OR** | **AND** | `@check`, `ketoCheck()`, `@policy` |

Aligning them would silently change what an existing `authorities` line means.
They do not get confused in practice: an authority is a **string**, a
permission term is an **object**, and the schema refuses one where the other
belongs.

The schema refuses outright, at parse time, with a message that names the key:

- `permissions: []` — a disjunction satisfied by nothing, admits nobody
- `permissions: [[]]` — a conjunction over no terms is vacuously true, **admits
  everyone** while reading like "no permission needed"

REST `id` must be `param.<name>`, `query.<name>` or `json.<path>`.
`args.` / `source.` are the GraphQL grammar and are rejected on REST.

**`param.` reads the pattern in the rules file, not the app's route.** A file
that says `/bookmarks/:bookmarkId` does not give you `param.id`, however the
Hono route is spelled — and when a `ketoCheck()` on the same route says
`param.id`, that is exactly how the two rails come to disagree in silence.

**Two id grammars, declared per transport.** REST reads `param.` / `query.` /
`json.`; GraphQL reads `args.` / `source.` — `source.` being how a field on a
returned type names its object (`User.email` guarded by `source.id`). Written
once on a shared entry, either spelling would be accepted on either side,
autocompleted, and then resolve nothing at request time. Rule entries on both
sides are `.strict()`, so the wrong grammar fails at startup naming itself.

Everything else is identical and shared in code: `evaluateKetoRungs` walks the
rungs, short-circuits and maps the denials for both evaluators.

### A path no rule names is open

`NOT_APPLICABLE` means open, and adding `keto` terms does not change that. A
file that decides per object *looks* more complete than it is. Mount the guard
on a prefix (`app.use('/api/*', …)`), never per route, and keep whatever
answers the authentication floor.

`global.unmatched: deny` closes it: an unnamed path is refused where it would
have passed, 401 for an anonymous caller and 403 otherwise — the same ladder a
matched rule applies. The decision is taken in `evaluateRest`, not in each
guard, so `policyGuard` and a dry-run `POST /evaluate` cannot disagree.

Turn it on only when the file is exhaustive. `unnamedOperations` is how you
know:

```ts
import { loadRawRulesFromFile, parseRules, unnamedOperations } from '@nxgt/security/policy';

const policy = parseRules(await loadRawRulesFromFile('rules.yaml'));
expect(unnamedOperations(policy, app.routes, { mountedOn: '/api' })).toEqual([]);
```

Feed it **the app's own route table** where there is one: it is the mounted
surface, which is what the guard will actually be asked about. An OpenAPI
document is the fallback (`openapiOperations(doc.paths, { prefix: '/api' })`)
and it is strictly weaker — a service that mounts three routes it does not
document reports them as no concern at all.

It asks the compiled matchers directly — "does any rule name this operation",
not "would it allow this caller" — so there are no claims to invent, no Keto
evaluator to stub and no expression to run. It collapses duplicates, skips
wildcard mounts and anything outside `mountedOn`, and catches a **method** the
file forgot on a path it does name.

**`unmatched` is REST-only.** `applyGraphqlPolicy` leaves a field with no rule
entry completely untouched: its resolver is never wrapped. Making one apply
would mean wrapping every field of every type — `Note.title` included — and a
GraphQL document would have to enumerate the whole schema before it could boot.
The floor on that side is `@authenticated` on the fields themselves.
`compilePolicy` therefore **throws** when a document carries both
`global.unmatched: deny` and a `graphql:` block, rather than closing half of
it in silence.

## GraphQL wrapper (`@nxgt/security/policy/graphql`)

Not re-exported from `@nxgt/security/policy` — importing it pulls in `graphql`
and `@graphql-tools/utils`.

```ts
import { loadRawRulesFromEnv } from '@nxgt/security/policy';
import { applyGraphqlPolicy } from '@nxgt/security/policy/graphql';

const rawRules = await loadRawRulesFromEnv({ envVar: 'RULES_FILE', fallbackPath: 'rules.yaml' });

const schema = applyGraphqlPolicy(rawSchema, rawRules, {
	getClaims: (context) => (context as { claims: PolicyClaims }).claims,
});
```

Accepts a raw document only (never a pre-compiled `CompiledPolicy`) — it
validates and compiles internally, once, at wrap time, not per request.

For every `typeName.fieldName` covered by a rule, the resolver is replaced with
a wrapper that runs the same authorities + expression check as
`evaluateGraphql`, delegating to the original (or `defaultFieldResolver`) on
ALLOW, and throwing a `GraphQLError` (`extensions.code: 'FORBIDDEN'`) on DENY.
Fields with no rule entry are left untouched. The original schema is never
mutated; `mapSchema` returns a new one. That works for Yoga, Apollo, Mercurius,
or a hand-rolled `makeExecutableSchema` — no GraphQL server library is a
dependency of this package.

GraphQL expressions see `claims`, `args`, `source` (the parent value) and
`info` (`GraphQLResolveInfo`).

**Non-null fields.** A resolver error on `String!` / `ID!` propagates to the
nearest nullable ancestor and can wipe unrelated siblings. `applyGraphqlPolicy`
defaults to `strict: true`: it throws `NonNullRuleFieldError` at wrap time for
any rule-covered field whose type is non-null. Mark the field nullable, or pass
`strict: false` to acknowledge the cascade.

**Since 3.0.0 it honours every decision.** It used to branch on `DENY` alone,
so a field under a rule the REST guard answers 401 for let an anonymous caller
straight to its resolver. It now throws `UNAUTHENTICATED` for a caller the
floor turned away, and carries a Keto rung's `NOT_FOUND` / `FORBIDDEN` code and
i18n key onto the `GraphQLError`.

## Integrations

### `claimsFromOryPrincipal` (`@nxgt/security/integrations/ory`)

The one mapper from a resolved Ory caller to the `PolicyClaims` a rule sees.

There were two, and they had drifted. `oryAuth()` in `@nxgt/shared-hono` wrote
`exp` as an **ISO string** into a field declared `number`; `useOryAuth()` in
`@nxgt/shared-graphql` wrote it as seconds but dropped `email_verified`, `aal`
and `aud`. The same caller reached the same rule as two different objects
depending on the transport, so `expression: "claims.aal === 'aal2'"` guarded a
REST route and silently guarded nothing on a GraphQL field. Both middlewares
call this now.

`PolicyClaims` is **Kratos/OIDC-shaped**: `sub`, `kind`, `email`,
`email_verified`, `aal`, `aud`, `clientId`, `scope`, `iss`, `exp` (NumericDate
— seconds, RFC 7519 §2). The oauth-api vocabulary (`username`, `authorities`,
`roles`, `permissions`, `uid`, `user`) is still there and still checked by
`checkAuthorities`, but it is marked `@deprecated`.

An Ory caller has **no** `authorities` and **no** `roles` — deliberately. Keto
answers per object; the only way an `authorities:` group is satisfied is
through the space-split `scope`.

This module imports `stx-sdk` and is its own entrypoint: a service that
resolves callers some other way never loads it and never installs the optional
peer.

### `policyGuard` (`@nxgt/security/integrations/hono`)

```ts
import { loadRawRulesFromEnv } from '@nxgt/security/policy';
import { policyGuard } from '@nxgt/security/integrations/hono';

const rawRules = await loadRawRulesFromEnv({ envVar: 'RULES_FILE', fallbackPath: 'rules.yaml' });
app.use('/api/*', bearerAuth(), policyGuard(rawRules));
```

Accepts a raw document only; compiles internally, once, when `policyGuard(...)`
is called. If a service also needs a `CompiledPolicy` for direct
`evaluateRest` calls, load the raw document once and derive both:
`const rawRules = await loadRawRulesFromEnv(...); const policy = compilePolicy(rawRules);`.

Must run after the token-resolution middleware (`bearerAuth` / `currentUser` /
`oryAuth` / …) that populates the `USER_HEADERS` **context variables** — not
request headers, so nothing a client sends can reach the decision directly.

On DENY it throws a 403 `CustomException` — or a 404 when the refusal came from
a `keto` rung declaring `onDeny: NOT_FOUND`. On ALLOW / NOT_APPLICABLE it calls
`next()`.

This subpath depends on `@nxgt/shared`, `@nxgt/shared-exceptions`,
`@nxgt/shared-logging`, and `hono`. Consumers that never import it never pull
those in.

### `ketoPermissions` for REST (`@nxgt/security/integrations/hono/keto`)

What a rules file's `keto` terms need in order to be answerable. Own
entrypoint, only REST module in this package that imports `stx-sdk`:

```ts
import { policyGuard } from '@nxgt/security/integrations/hono';
import { ketoPermissions } from '@nxgt/security/integrations/hono/keto';

app.use('*', oryAuth(ory), oryChecks(ory));
app.use('/api/*', requireAuthenticated(), policyGuard(rawRules, { permissions: ketoPermissions() }));
```

It reads `ory.subject` from `oryAuth()` and the per-request `ketoChecks`
DataLoader from `oryChecks(ory)`, which must therefore be mounted **before**
the guard. That loader memoises by Keto's own `Bookmark:b1#view@idn-7`
notation, so the same question asked by the rules file and again by a
`ketoCheck()` on the route costs one round trip.

The DNF walk itself is `evaluateRequirement` from `stx-sdk/ory`, not a copy —
so the rules file, `@check` and `ketoCheck()` cannot disagree about
`[[A, B], [C]]`.

`stx-sdk` is an **optional** peer: a service whose rules file has no `keto`
term never imports this subpath. A rule that carries a `keto` term with no
evaluator supplied **throws**; it is never an allow.

### `ketoPermissions` for GraphQL (`@nxgt/security/integrations/graphql/keto`)

```ts
import { applyGraphqlPolicy } from '@nxgt/security/policy/graphql';
import { ketoPermissions } from '@nxgt/security/integrations/graphql/keto';

const policed = applyGraphqlPolicy(schema, rawRules, {
	getClaims: (ctx) => (ctx as IContext).claims,
	permissions: ketoPermissions(),
});
```

Reads `ory.subject` and the `ketoChecks` DataLoader off the GraphQL context —
what `useOryAuth(ory)` and `useKetoChecks(ory)` from `@nxgt/shared-graphql`
publish, so `useKetoChecks` must be registered before the policed schema is
served. Same consequence as REST: a `@check` on the field and a `keto` rung
asking the same question cost one round trip.

## Things that bite

- **`authorities` AND/OR vs `keto` OR/AND.** Do not "make them consistent".
- **`permissions: []` admits nobody; `permissions: [[]]` admits everyone.**
- **`param.` is the rules-file pattern, not the Hono route.**
- **`global.unmatched: deny` is REST-only**; combining it with `graphql:`
  throws at compile.
- **A `keto` term without an evaluator throws**, never allows.
- **`rateLimit` / `cors` / `providers` validate and go nowhere.**
