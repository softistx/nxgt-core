---
name: create-ory-native-graphql-api
description: >-
  Build a GraphQL API against the Ory stack: Kratos sessions through
  `useOryAuth`, `@authenticated`, and the `@check` directive with
  `useKetoChecks` batching Keto per request. Use when adding an Ory-native
  Yoga API. It is a delta on `create-standalone-graphql-api` — read that
  first.
---

# Skill: Create an Ory-native GraphQL API

> **Read `references/ory-in-one-page.md` first.** It carries the model — who is
> calling, what a permit is, which listeners are unauthenticated, who may write
> tuples — plus the stx-sdk entry-point table and `src/ory/tuples.ts`, all of
> which are the same whichever transport you build. This file is the delta for
> a Yoga GraphQL API.

## Purpose
Use this skill to build a **standalone Yoga GraphQL API** whose callers are
authenticated by the **Ory stack** (the `nxgt-ory` repo: Kratos
sessions, Hydra tokens) and authorised **per object by Ory Keto** — instead of
by oauth-api's introspection and `@policy` authorities.

It is a **delta on `create-standalone-graphql-api`**: read that skill first;
everything it says about the Yoga + Hono bootstrap, SDL-first codegen,
`MongoCrudService`, module layout, modular i18n and `bun test` still applies.
The reference implementation is **`apps/notes/notes-api`** — `self-learning-api`
with the authority swapped, built to be copied. Read its `README.md`,
`AGENTS.md` and `docs/` before you start.

---

## When to use
- A new standalone API whose users are Kratos identities (the accounts
  kratos-ui registers) and/or machines holding Hydra tokens.
- The access model is "who owns / who was granted what, per object" — a Keto
  question — rather than "which authority may call which field".

Do **not** use it for a federated subgraph (auth is the gateway's), nor for a
standalone API of the oauth-api world (`useAuth()`, `@policy`).

---

## What changes from self-learning-api, and what does not

| Concern | self-learning-api | Ory-native |
| --- | --- | --- |
| Auth plugin | `useAuth()` (oauth-api introspection) | **`useOryAuth(ory)`** from `@nxgt/shared-graphql` — puts `user` (repo-wide `Principal`, `authorities: []`), `ory` (`OryPrincipal`) and `token` on the context |
| `useGenericAuth` + `@authenticated` | enforced from `context.user` | **unchanged** — every field `@authenticated`, none `@policy` |
| Per-object decision, declared | a docstring saying "needs edit" | **`@check` on every single-object field**, answered by `useKetoChecks(ory)` |
| Per-object decision, enforced | `ownerId === principal.sub` in the service | **`requireXAccess(check, id, caller, relation)`** in `<m>.access.ts`, over Keto |
| Ownership | a field | a **tuple** written by the service at creation (+ `ownerId` kept for display only) |
| Error mapping | Yoga default (`"Unexpected error."` for a `CustomException`) | **`maskedErrors: { maskError: createMaskError(translate) }`** — code, translated message, `http.status` (404 / 403 / 401 / 409 / 503) |
| Services factory | `services(user)` | `services(user, caller, check)` — `check` is the per-request Keto loader off the context, **not** the `ory` instance |
| Everything else | — | **unchanged**: `createYogaHono`, codegen mappers, `MongoCrudService`, integrity registry, i18n, `bun test` from the app dir |

---

## Directory structure (additions to the standalone layout)

```
apps/<product>/<product>-api/
├── AGENTS.md, README.md, docs/{README,01-authentication,02-authorization,03-troubleshooting}.md
├── .env.development (NODE_ENV, MONGODB_URI composed), .env.test (PORT, -test db)
└── src/
    ├── env.ts                      # + KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL, KETO_READ_URL, KETO_WRITE_URL, HYDRA_ADMIN_URL (localhost defaults)
    ├── index.ts                    # serve({ port: env.PORT, … }) — explicit, or Bun binds 3000
    ├── config/ory.ts               # ONE createOry(); ketoWrite + createIdentityAdmin kept apart
    ├── ory/tuples.ts               # ONE createTuples() from stx-sdk/ory/tuples — never hand-written
    ├── graphql/server.ts           # useOryAuth(ory) + useGenericAuth + maskedErrors.maskError
    ├── graphql/plugins/services.ts # services(context.user ?? null, context.ory ?? null)
    └── modules/<m>/
        ├── <m>.graphqls            # myAccess: <M>Access! on the type; every field @authenticated
        ├── <m>.access.ts           # resolve<M>Access / require<M>Access — the only Keto question
        ├── <m>.service.ts          # create → grant owners; share → grant viewers; findAll from heldBy
        ├── <m>.integrity.ts        # delete cascade → revokeAll
        ├── <m>.service.spec.ts, <m>.graphql.spec.ts
```

## Key source files (copy from notes-api, rename)

### `src/config/ory.ts`
```ts
export const ory = createOry({ kratosPublicUrl: env.KRATOS_PUBLIC_URL, ketoReadUrl: env.KETO_READ_URL, hydraAdminUrl: env.HYDRA_ADMIN_URL });
export const ketoWrite = createKetoWriteClient(env.KETO_WRITE_URL);   // src/ory/tuples.ts only
export const kratosAdmin = createKratosClient(env.KRATOS_ADMIN_URL);

// The share-by-email lookup. NOT a raw kratosAdmin.GET — see `<m>.service.ts`.
export const identities = createIdentityAdmin({ kratosAdmin });      // stx-sdk/ory/admin
```

### `src/graphql/server.ts`
```ts
createYoga({
  schema,
  maskedErrors: { maskError: createMaskError(translate) },
  plugins: [
    useOryAuth(ory),
    useGenericAuth({ mode: 'protect-granular', resolveUserFn: async (ctx: PrincipalContext) => ctx.user ?? null,
                     extractPolicies: async (user) => user?.authorities ?? [], rejectUnauthenticated: false }),
    useKetoChecks(ory),
    useGraphQLSSE(), useServicesProvider(),
  ],
});
```
Order is load-bearing: `useKetoChecks` needs `ory.subject`, which `useOryAuth`
puts on the context, and `useServicesProvider` needs the checker, which
`useKetoChecks` puts there. Envelop runs `onContextBuilding` in plugin order.

Keep `maskedErrors` when copying: without it every `notFound()` is an opaque
500. Anonymous access to an `@authenticated` field is generic-auth's own
answer — HTTP 401, code `UNAUTHORIZED_FIELD_OR_TYPE`, the field `null` — the
same as every standalone API here; do not special-case it.

### `<m>.graphqls`
`myAccess: <M>Access!` (`OWNER | VIEWER`, what Keto resolved for the caller),
`ownerId: String!` (display), `<M>Share { subjectId }`, a `Share<M>Input {
subjectId, email: EmailAddress }`, `<m>Shares(id)`, `share<M>`, `unshare<M>`.
Every field `@authenticated`; **no `@policy`** — an Ory principal's
`authorities` is empty and `@policy` would lock everybody out.

**`@check` on every field that names ONE object, nothing on the lists.**

```graphql
<m>(id: ID!): <M>!
	@authenticated
	@check(
		permissions: [[{ namespace: "<M>", permit: "view" }]]
		message: "<m>.errors.not-found"
	)

update<M>(id: ID!, input: Update<M>Input!): <M>!
	@authenticated
	@check(permissions: [[{ namespace: "<M>", permit: "view" }]] message: "<m>.errors.not-found")
	@check(permissions: [[{ namespace: "<M>", permit: "edit" }]] onDeny: FORBIDDEN)

delete<M>s(ids: [ID!]!): Void
	@authenticated
	@check(permissions: [[{ namespace: "<M>", permit: "view", id: "args.ids" }]] message: "<m>.errors.not-found")
	@check(permissions: [[{ namespace: "<M>", permit: "edit", id: "args.ids" }]] onDeny: FORBIDDEN)
```

| field | `@check` |
| --- | --- |
| `<m>(id)` | `view` / `NOT_FOUND` |
| `<m>Shares(id)`, `update<M>`, `delete<M>`, `share<M>`, `unshare<M>` | `view` / `NOT_FOUND`, then `edit` / `FORBIDDEN` |
| `delete<M>s(ids)` | the same, with `id: "args.ids"` — the permit on **every** element |
| `<m>s(…)`, `create<M>(…)` | **none** |

Four rules, each of which has already gone wrong somewhere:

- **`permissions` is `[[ ]]`** — outer list OR, inner list AND, the namespace
  written out in every term. `[[]]` is a conjunction over no terms, so it is
  vacuously true and admits everyone; `assertRequirement` refuses it when the
  schema is built rather than letting it become an incident.
- **The order of two `@check` is the 404→403 ladder.** `view` first means a
  stranger cannot probe an id; `edit` second means a viewer, who already knows
  the object is there, gets an honest 403.
- **Carry `message:` wherever the service answers a domain message.** The field
  is guarded twice, and two different words behind one 404 tell the caller
  which layer refused — the one thing `NOT_FOUND` exists to hide.
- **Nothing on a list.** "Which notes may I see" is a Keto query folded into
  the Mongo filter before the read, not a check. A directive there would fetch
  everything and filter after, and `totalCount` and the cursors would lie.

### `<m>.access.ts`
```ts
export async function require<M>Access(check: KetoChecker, id, caller: OryPrincipal | null, relation: 'view' | 'edit' = 'view') {
  if (!caller) throw CustomException.unauthenticated();
  const result = await resolve<M>Access(check, id, caller);   // edit? OWNER : view? VIEWER : null
  if (!result) throw CustomException.notFound({ message: '<m>.errors.not-found' });      // no view → NOT_FOUND, never FORBIDDEN
  if (relation === 'edit' && result.access !== 'OWNER') throw CustomException.forbidden({ message: 'errors.insufficient-permissions' });
  return result;
}
```
Called from the **service**. Resolvers never ask Keto. `caller.subject` is
what goes to Keto — never `user.sub` (equal, but the first says what it is).

**It takes `check`, the per-request checker, not `ory`.** That is what makes it
free to keep alongside `@check`: `useKetoChecks(ory)` puts a `DataLoader` on
the context which memoises identical questions and batches distinct ones into
one `POST /relation-tuples/batch/check`, so a service asking about an object
whose directive just passed pays nothing.

And it does have to be kept. The directive guards the schema; the service is
reachable from a subscription resolver, a job, a REST edge — anywhere the SDL
is not. A decision that lives only in the schema stops protecting the moment
something else calls the service.

### `<m>.service.ts` (`extends MongoCrudService`, constructor `(principal, check, caller)`)
- `create`: `super.create()`, then `grant(id, 'owners', caller.subject)`; on
  failure delete the document. After, not inside — the mutex is not reentrant.
- `findAll`: `heldBy(caller.subject)` → `Map<id, relation>`; `filter.access`
  picks a side; Mongo filter `$and: [{ _id: { $in: ids } }, <client filter>]`
  (AND-ed, never OR-ed); decorate each node with `myAccess` from the map.
  Direct tuples only — group-inherited access is reachable by id, not listed.
- `share(id, { subjectId | email })`: `require…(…, 'edit')`, resolve the email
  through **`identities.findByEmail(email)`** (`stx-sdk/ory/admin`), refuse
  self, `grant(id, 'viewers', target)`.

  **Never `kratosAdmin.GET('/admin/identities', …)` read straight.**
  `openapi-fetch` leaves `data` undefined on any non-2xx, so that call answers
  `share-target-not-found` — a NOT_FOUND — whenever Kratos is down. Both
  reference APIs shipped that bug. `findByEmail` answers `null` only when
  Kratos ANSWERED and had nobody, and throws `OryUnavailable` otherwise.
- `<m>.integrity.ts`: cascade delete → `revokeAll`.
- codegen mappers: `<M>` → `<M>View` (document + `myAccess`), `<M>Connection`
  → `Paginated<M>`.

---

## Environment
`src/env.ts` with explicit `Bun.env` mapping and `localhost` defaults for the
five Ory URLs; root `.env.example` and `docker/shared.env` already carry
`KRATOS_*`, `KETO_*`, `HYDRA_PUBLIC_URL`, `HYDRA_ADMIN_URL`. `oxfile.toml`
entry with the container names. **`serve({ port: env.PORT })`** — without it
Bun binds `process.env.PORT || 3000` while the sandbox says otherwise.

## Testing
Two specs, both against the **live** Keto and Hydra — nothing about
authorization is mocked. `<m>.service.spec.ts`: three run-unique
`OryPrincipal`s (owner, friend, stranger), asserting `isAllowed` on Keto as
well as the service's answer. `<m>.graphql.spec.ts`: `yoga.fetch` with a
real Hydra `client_credentials` token (`sub` = client id): `NOT_FOUND` 404,
`FORBIDDEN` 403, generic-auth's 401 for anonymous / garbage Bearer. Sweep
tuples in `afterAll`. **Run from the app directory** (Bun loads `.env.test`
from the cwd only; from the root `clearDatabase()` refuses the dev db):

```sh
cd apps/<product>/<product>-api && env -u MONGODB_URI KRATOS_PUBLIC_URL=http://localhost:4433 \
  KRATOS_ADMIN_URL=http://localhost:4434 KETO_READ_URL=http://localhost:4466 \
  KETO_WRITE_URL=http://localhost:4467 HYDRA_ADMIN_URL=http://localhost:4445 bun test
```

---

## Documentation (mandatory — part of the same branch)
1. `README.md` — running it (the stack lives in the sibling repo), a *Try it
   with a token* recipe, the schema table with a **Needs** column, non-goals
   (no user table, no `@policy`, not federated).
2. `docs/README.md` (one picture), `01-authentication.md`,
   `02-authorization.md` (404 vs 403, tuple writer, how a list is built),
   `03-troubleshooting.md` — **real failures only**, symptom → cause → fix.
3. `AGENTS.md` — the imperative, pointing at `docs/` for the why.
4. Root `AGENTS.md` *Ory-native APIs* (if the shape changed), `oxfile.toml`,
   `apps/mcp/graphql-executor/src/config/graphql-apis.ts` (register the API).
5. nxgt-ory's `README.md` — one row in the consumers table. **Another repo:
   its own PR.**

## Steps
1. Stack up in `nxgt-ory`; `curl localhost:4466/namespaces`.
2. Add the namespace to nxgt-ory's `config/keto.namespaces.ts` — **a commit
   there, and it must land first**: nothing here compiles against a Keto
   namespace and nothing warns you. That repo has a skill for exactly this
   step, `change-stack-config`; load it rather than editing the file from
   memory — the restart rule alone costs twenty minutes to rediscover;
   syntax-check; restart Keto. That is a sellix PR — land it first.
3. Copy `apps/notes/notes-api`; rename `notes` → `<m>`; pick a free port
   (`ss -ltn`, `oxfile.toml`) and test port; `bun install`.
4. Schema → `bun run codegen` → model / access / tuples / service /
   integrity / resolver; i18n keys.
5. `bun run typecheck`, `bunx biome check --write .`, both specs.
6. `bun run build`; boot the binary; `curl` a token round trip.
7. Registrations and documentation, all of the above.
8. PR to `develop` per `large-feature-branch-workflow`.

## Checklist before finishing
- [ ] `useOryAuth(ory)` in `useAuth()`'s slot; `useGenericAuth` unchanged; `maskedErrors.maskError` set
- [ ] `useKetoChecks(ory)` after `useOryAuth`, before whatever builds the services
- [ ] Every field `@authenticated`, none `@policy`
- [ ] `@check` on every single-object field — `view`/NOT_FOUND then `edit`/FORBIDDEN — and **none** on the lists or on `create<M>`
- [ ] Every `@check` whose service answers a domain message carries the same `message:` key
- [ ] `require<M>Access` takes the context's `check`, not `ory`; answers NOT_FOUND for no `view`, FORBIDDEN for `view` without `edit`; resolvers never ask Keto
- [ ] `create` grants owners after the document and rolls back; delete cascades to `revokeAll`; list from `heldBy`, AND-ed
- [ ] `ketoWrite` imported by `src/ory/tuples.ts` only, guarded by `noRestrictedImports`
- [ ] `src/ory/tuples.ts` is a `createTuples({ … })` call, not hand-written calls
- [ ] The share-by-email lookup is `identities.findByEmail`, not a bare `kratosAdmin.GET`
- [ ] `serve({ port: env.PORT })`; specs run from the app dir with the host prefix
- [ ] README + docs/ + AGENTS.md + oxfile + graphql-apis + sellix consumers row
