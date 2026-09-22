---
name: build-a-graphql-yoga-api
description: >-
  Lay out a GraphQL Yoga API on Bun: one folder per module with nine files
  and its spec beside it, `createSchema` with the shared type defs, codegen
  driven by a mappings list, a services provider that builds the per-request
  graph from the resolved principal, modular i18n resources, and
  `createMaskError` so a dependency outage answers 503. Use when starting a
  GraphQL API, adding a module or a resolver to one, wiring its codegen,
  context, i18n or specs, or deciding where a caller's identity comes from.
---

# Skill: Build a GraphQL Yoga API

## Purpose

The shape of a GraphQL API in these repositories: where files go, what the
schema is built from, how a request acquires its services, and where the
caller's identity comes from. It is the GraphQL sibling of
`build-a-bun-hono-api` — same organisation, different transport.

Three implementations are worth reading before starting:

| where | what it is |
| --- | --- |
| `softistx/self-learning/apps/api` | **the worked example**, and the only one that is Ory-native end to end |
| `softistx/content-hub/apps/api` | the same shape with the auth half not yet migrated |
| `nxgt-federation/apps/notes/notes-api` | Ory-native, and inside a repository that also has subgraphs |

**Authentication is not this skill's.** Load `nxgt-ory-app`'s
`create-ory-native-graphql-api` for who the caller is: `useOryAuth(ory)`,
`useKetoChecks(ory)` if and only if the SDL has `@check` directives, and the
404-then-403 ladder. Everything below is true whichever plugin resolves the
principal — but §6 is not optional either way.

A subgraph of a federated supergraph is this shape plus four deltas, and they
only make sense in a repository that has a supergraph:
`references/nxgt-federation.md`.

---

## 1. One folder per module, and the spec lives in it

```
src/
	env.ts                 parsed once, with zod
	index.ts               the entrypoint (§2)
	config/                mongoose.ts · redis.ts · ory.ts · tests.config.ts
	generated/graphql.ts   generated, never edited, gitignored
	graphql/
		schema.ts  server.ts  context.ts  index.ts
		plugins/   services.ts (+ whatever resolves the principal)
	i18n/                  §7
	modules/
		index.ts           composes; learns nothing about a module
		questions/
			questions.graphqls        the SDL for this module only
			questions.model.ts        the mongoose schema and its Document type
			questions.service.ts      the behaviour; takes the principal
			questions.service.spec.ts beside it, not in a tests/ tree
			questions.resolver.ts     Query · Mutation · field resolvers
			questions.data-loader.ts   the N+1 boundary
			questions.integrity.ts    cascades and blockers
			questions.storage.ts      the lazy bucket singleton, if it has media
			questions.utils.ts        filter/sort builders
			index.ts
```

`modules/index.ts` **composes and nothing else** — one line per module in each
of five places, and no knowledge of what any of them do:

```ts
export const services = (user: TokenPrincipal | null) => ({
	questions: new QuestionService(user),
});
export const dataLoaders = () => ({ questions: new QuestionDataLoader() });
export const dataSources = () => ({});             // only if it calls REST
export const resolvers = merge(questions, quizzes);
export function registerIntegrities() { registerQuestionIntegrity(); }

export type Services = ReturnType<typeof services> & { redis: Redis; audit: AuditService };
```

If adding a module means editing a central file in more than those places, that
file has become a layer again.

## 2. The entrypoint: a Yoga instance inside a Hono app

```ts
const yoga = await setupGraphQLServer();
const app = createYogaHono(yoga, { sandbox: { port: env.PORT } });
serve({ fetch: app.fetch, hostname: '0.0.0.0', idleTimeout: 60 });
```

`createYogaHono` (`@nxgt/shared-graphql`) is not a convenience wrapper to
reimplement: it registers `contextStorage()` and `languageDetector()` ahead of
the GraphQL mount for every app that uses it. **Locale is therefore ambient**,
resolved per request from `Accept-Language` — so a query or mutation that returns
localised content must **never take a `locale` argument**. Call `translate()`
(§7) and it resolves the caller's language by itself.

Two calls come **before** the server, in this order, and the order is the
reason to write them out rather than fold them into a helper:

```ts
registerIntegrities();                    // cascades must exist before a delete can fire
registerAuditSubscription({ pubsub });    // the audit listener, once per process
```

## 3. The schema: `createSchema`, with the shared type defs first

```ts
const typeDefs = [
	SHARED_TYPE_DEFS,
	loadTypeDefs(SHARED_SCHEMA_PATH, join(__dirname, '../**/*.graphqls')),
];
export const schema = createSchema({ typeDefs, resolvers: merge(SCALAR_RESOLVERS, resolvers) });
```

`SHARED_TYPE_DEFS` and `SCALAR_RESOLVERS` are both load-bearing: the shared SDL
declares `PostalAddress`, the pagination types and the custom scalars, and
`SCALAR_RESOLVERS` is what implements them. Merge order matters — the app's
resolvers go second so a module can override a scalar deliberately.

`buildSubgraphSchema` instead of `createSchema` is the subgraph fork, and it is
the whole of the difference at this layer — see the reference.

## 4. Codegen is driven by a list, not by hand

`codegen.ts` reads `./src/**/*.graphqls` plus `SHARED_SCHEMA_PATH` and writes one
file. Everything per-type comes from a `mappings` array of
`{ name, folder, scope }`, which produces both mappers per entry:

```ts
mappers: {
	...mappings.reduce((acc, { name, folder, scope }) => {
		acc[name] = `../modules/${scope ? `${scope}/` : ''}${folder}#${name}Document`;
		acc[`${name}Connection`] = `../modules/${scope ? `${scope}/` : ''}${folder}#Paginated${name}`;
		return acc;
	}, {} as Record<string, string>),
	// An embedded subdocument is mapped by hand: it has no Model and no Connection.
	Answer: '../modules/quiz-attempts#AnswerSubdocument',
},
contextType: '../graphql#IContext',
scalars: SCALARS_MAPPING,
defaultMapper: 'Partial<{T}>',
```

- **`federation: true` only in a subgraph.** In a standalone API it emits
  reference resolvers for types nothing will ever resolve by reference.
- **`generated/` is gitignored and `codegen` runs from `postinstall`.** That is
  why an image must install before it builds, and why CI installs *without*
  `--frozen-lockfile` — `lay-out-a-product-repository` §5 and §8.
- A type with no mongoose Model gets no mapper entry. `defaultMapper:
  'Partial<{T}>'` already covers it.

## 5. The services provider builds the per-request graph

One envelop plugin, `useServicesProvider()`, and it is the only place services are
constructed:

```ts
extendContext({
	services: { redis, audit: new AuditService(), ...services(context.user ?? null) },
	dataLoaders: dataLoaders(),
	dataSources: dataSources(),
});
```

`context.user` is whatever resolved the principal — so a service never reads a
header, never sees a token, and takes the principal in its constructor.

**The WebSocket context is a different type, and must not pretend otherwise.**
That path mounts no plugins, so there is no principal on it. `IContext` extends
the auth context; `IWsContext` does not:

```ts
export interface IContext extends GraphQLBaseContext, OryContext { … }
export interface IWsContext extends GraphQLBaseContext { … }   // no principal
```

Typing the WS context as if it had one makes a subscription resolver look like it
can ask who is calling, which it cannot.

**`maskedErrors.maskError: createMaskError(translate)`** belongs on `createYoga`.
Yoga masks every non-`GraphQLError` as "Unexpected error." — including a
service's `CustomException.notFound()` and an infrastructure error such as
`OryUnavailable`. `createMaskError` gives them back their code, message and HTTP
status, so an outage of a dependency answers **503** and not a failure a client
cannot tell from a bug.

That function catches with `instanceof`, which is the trap: two copies of one
class are two classes. A `@nxgt/shared-graphql` major that moved where
`OryUnavailable` comes from must land in the **same commit** as the code that
throws it, or the check silently stops matching — it typechecks, it builds, and
it only shows up when the dependency is actually down.

## 6. Identity comes from the principal — never from an argument

A mutation or query that acts **on behalf of the caller** derives the identity
inside the service, from `this.principal?.sub` (or `.uid`, depending on what the
issuer's introspection populates). It does **not** take a `userId`/`ownerId`
input:

```ts
if (!this.principal?.sub) throw CustomException.unauthenticated({ … });
if (doc.userId !== this.principal.sub) throw CustomException.forbidden({ … });
```

A client-supplied `userId` lets any caller act as any other user. Mark the field
`@authenticated` in the SDL as well, so the schema rejects an anonymous call
before a resolver runs.

Two boundaries on that rule:

- **An admin or reporting query** that deliberately spans users (a
  `filter.userId` on a paginated connection, documented as such) is a legitimate
  exception. It still requires `@authenticated`, and a real policy check once the
  API has one.
- **`self-learning`'s learner-facing mutations take a plain `userId: String!`.**
  It is a documented one-off, recorded in that app's own README as an explicit
  non-goal — **not** a second valid convention. Derive from the principal in
  anything new.

## 7. i18n: one JSON per module, merged in two steps

```
src/i18n/resources/
	en/questions.json  en/quizzes.json  en/index.ts     ← spreads every module JSON
	fr/…                                                 ← the same key set
	index.ts                                             ← merges en/fr with @nxgt/i18n's
	types.ts
```

- Module keys are **camelCase** (`quizAttempts`) even when the folder is
  kebab-case, and each file is `{ "<module>": { "errors": { "not-found": … } } }`.
- `en` and `fr` must carry the **same key set**. A `check:i18n` script is what
  catches a missing one, and it belongs in CI — a missing key is not a type error.
- Consume with `import { translate } from '@/i18n'`. No locale argument, ever
  (§2).

## 8. Media goes to object storage, presigned

A module that accepts a file does not accept bytes through GraphQL. Load
`handle-a-file-upload` — it is the same pattern on both sides of the wire, and
`questions.storage.ts` in the worked example is a one-line file because of it.

## 9. Specs sit beside the code, and they are found by convention

There is no `test` script in an app for bun to run: **`bun test` auto-discovers
every `*.spec.ts`** under the target. The convention is `*.spec.ts`, never
`*.test.ts` — grep for the former before concluding a module is untested.

- **One unit spec per service**, `<name>.service.spec.ts`, constructing the
  service with a literal principal. When the service gates on `uid`, build a
  *second* instance with a different `uid` from `objectIdString()`
  (`@nxgt/shared-mongo`) and exercise the not-the-owner path.
- **Failure paths carry most of the value**: assert on
  `(error as CustomException).code` against the generated `ErrorCode`, not on the
  message.
- **One integration spec per workflow**, `<scope>.integration.spec.ts`, driving
  every service in the scope as the resolvers would — no HTTP, no GraphQL. Call
  `registerIntegrities()` in `beforeAll` when the flow exercises cascades, and
  drive the deletion cascades and blockers together in their own test.
- **`clearDatabase()` is guarded and must stay that way.** It refuses unless
  `NODE_ENV=test` **and** the connected database's name ends in `-test`. Both
  halves, because either alone is defeated by the same mistake: `bun test` sets
  `NODE_ENV=test` itself, which is what makes `.env.test` the file Bun loads, and
  that file names the `-test` database.

## Traps

- **No backticks in SDL doc strings.** `"""…"""` is GraphQL, not TypeScript;
  quote a field name as `"batch"`.
- **No `*.stub.graphqls` files.** A stub type belongs in an `# External stubs`
  block at the top of the module SDL that uses it, declared once per service —
  every `.graphqls` in the service is loaded together.
- **A per-request service must not hold a lazy singleton as a field.** The
  laziness is what stops a bucket-existence check firing on every request; a
  field re-fires it per instance. Module-level, always (`handle-a-file-upload`).
- **`bun run --cwd <app> build` has printed bun's help text and exited 0** inside
  an image. Use `cd <app> && bun run build` in a `RUN`, and keep `--cwd` for
  `CMD`.

---

## Checking it

```bash
bun install && bun run codegen        # generated/ rewritten, no diff in git
bun run typecheck
bun test apps/api                     # from the repo root, so .env.test is loaded
bun run --cwd apps/api dev            # then open /graphql and introspect

grep -rn 'locale' src/**/*.graphqls          # no locale argument anywhere
grep -rn 'userId' src/**/*.graphqls          # every hit is admin/reporting, or documented
grep -rln 'federation: true' codegen.ts      # only in a subgraph
```

And the question that finds the class of bug §5 is about: **when the identity
provider is down, what does this API answer?** 503 means `createMaskError` is
mounted and its `instanceof` still matches. 500 means one of the two is false.
