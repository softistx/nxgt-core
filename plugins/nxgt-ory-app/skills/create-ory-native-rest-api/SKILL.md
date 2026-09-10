---
name: create-ory-native-rest-api
description: >-
  Build a REST API against the Ory stack: Kratos sessions through `oryAuth`,
  `requireAuthenticated()`, and `ketoCheck()` on the routes that name one
  object, with the 404-then-403 ladder said twice — declaratively on the route
  and again in the service. Use when adding an Ory-native Hono API, or
  converting one off a rules file.
---

# Skill: Create an Ory-native REST API

> **Read `references/ory-in-one-page.md` first.** It carries the model — who is
> calling, what a permit is, which listeners are unauthenticated, who may write
> tuples — plus the stx-sdk entry-point table and `src/ory/tuples.ts`, all of
> which are the same whichever transport you build. This file is the delta for
> a Hono REST API.

## Purpose
Use this skill to build a Hono REST API in this repo whose callers are
authenticated by the **Ory stack** (the sibling repo `nxgt-ory`: Kratos sessions, Hydra
tokens) and authorised **per object by Ory Keto** — instead of by oauth-api's
introspection and a `rules.yaml` naming authorities.

The reference implementation is **`apps/bookmarks/bookmarks-api`**. It is
`apps/storex/storex-api` with the authority swapped, built to be copied: read
its `README.md`, `AGENTS.md` and `docs/` before you start, and copy from it
rather than re-deriving. Every rule below is a rule that app already follows,
with the reason in its `docs/`.

---

## When to use
- A new API whose users are Kratos identities (the accounts kratos-ui
  registers) and/or machines holding Hydra tokens.
- The product's access model is "who owns / who was granted what, per
  object" — a Keto question — rather than "which role may call which path".

Do **not** use it for an API behind `apps/gateway` / oauth-api: that is the
storex-api shape unchanged (`remoteAuth()`, authorities in `rules.yaml`). That
exclusion is about the **oauth** stack's gateway. There is no equivalent on
this side: an Ory-native API has nothing in front of it and decides for itself.

---

## What changes from storex-api, and what does not

| Concern | storex-api | Ory-native |
| --- | --- | --- |
| Authentication middleware | `remoteAuth()` (oauth-api introspection) | `oryAuth(ory)` from `@nxgt/shared-hono` — same context contract (`principal`, `X-Claims`) plus `ory` and `accessToken` |
| Coarse "signed in" | `rules.yaml` + `policyGuard` | **`requireAuthenticated()` on `/api/*`** — no `rules.yaml` by default. An Ory principal has `authorities: []`, so a rules file had one boolean to express and one middleware expresses it, on a prefix a rule cannot forget to name |
| Per-object decision, declared | nothing — a comment | **`ketoCheck()` on each route naming one object** |
| Per-object decision, enforced | `<m>.access.ts` over a membership table | `<m>.access.ts` over **Keto**, taking the per-request checker — same file shape |
| Ownership | a field / a table row | a **tuple** written by the service at creation |
| Error handler | `createErrorHandler(translate)` | `withOryUnavailable(createErrorHandler(translate))` |
| A proxy in front | `apps/gateway` injects `X-User-*` and the app trusts them | **none** — nothing fronts an Ory-native API, so nothing erases those headers either. Never read an identity from one: `principalFromMockHeaders` reads those names behind only a `NODE_ENV` gate, and that is the sole exception |
| Everything else | middleware order, OpenAPI 3.2.0 → redocly → zod + types, `MongoCrudService`, `POST …/search` + `QUERY`, i18n, Dockerfile, compose per group, route specs | **unchanged** — the root `AGENTS.md` rules apply |

---

## Directory structure

```
apps/<product>/<product>-api/
├── AGENTS.md, README.md, docs/{README,01-authentication,02-authorization,03-troubleshooting}.md
├── Dockerfile, package.json, tsconfig.json, biome.json, redocly.yaml   # no rules.yaml
├── codegen.ts, openapi-ts.config.ts, openapi/{openapi.yaml,paths/,components/}
├── .env.development, .env.test
└── src/
    ├── index.ts                    # oryAuthentication() in remoteAuth()'s slot; withOryUnavailable on onError
    ├── env.ts                      # + KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL, KETO_READ_URL, KETO_WRITE_URL, HYDRA_ADMIN_URL
    ├── config/ory.ts               # ONE createOry(); ketoWrite + createIdentityAdmin kept apart
    ├── middlewares/auth.ts         # oryAuth(ory) — one line
    ├── ory/tuples.ts               # ONE createTuples() from stx-sdk/ory/tuples — never hand-written
    └── modules/<m>/
        ├── <m>.access.ts           # resolve<M>Access / require<M>Access — the only Keto question
        ├── <m>.service.ts          # create → grant owners; share → grant viewers; list from heldBy
        ├── <m>.integrity.ts        # delete cascade → revokeAll
        ├── <m>.routes.ts, <m>.models.ts, <m>.types.ts, <m>.utils.ts, <m>.routes.spec.ts
```

## Key source files (copy from bookmarks-api, rename)

### `src/config/ory.ts`
```ts
export const ory = createOry({
  kratosPublicUrl: env.KRATOS_PUBLIC_URL,
  ketoReadUrl: env.KETO_READ_URL,
  hydraAdminUrl: env.HYDRA_ADMIN_URL,
});
// The unauthenticated listeners, and the two factories that are the only
// things allowed to hold them. Never imported by a route file.
export const ketoWrite = createKetoWriteClient(env.KETO_WRITE_URL);
export const kratosAdmin = createKratosClient(env.KRATOS_ADMIN_URL);

// Resolving a share target's email. NOT a raw kratosAdmin.GET — see the
// service section: that reads an outage as "no such person".
export const identities = createIdentityAdmin({ kratosAdmin });
```
One `createOry()` for the process. The middleware and the access layer share it.

### `src/middlewares/auth.ts` and `src/index.ts`
```ts
export const oryAuthentication = () => oryAuth(ory);
// index.ts — where storex-api has remoteAuth():
app.use('*', oryAuthentication(), oryChecks(ory), servicesProvider());
app.use('/api/*', requireAuthenticated());    // 401 — everything a rules file said
app.onError(withOryUnavailable(createErrorHandler(translate)));
```
Order is load-bearing twice over. `oryChecks(ory)` needs the caller
`oryAuthentication()` resolved, and `servicesProvider()` needs the checker
`oryChecks` puts on the context — a service built without one cannot answer a
per-object decision at all, so it throws rather than starting.
`withOryUnavailable` maps an `OryUnavailable` thrown *below* the middleware
(the access layer's `isAllowed`, the tuple helpers) to 503. Without it a Keto
restart is "Internal server error" — or an empty list.

### `<m>.routes.ts` — `ketoCheck()` where the route names one object

```ts
const canView = () =>
  ketoCheck([[{ namespace: '<M>', permit: 'view', id: 'param.id' }]],
            { message: '<m>.errors.not-found' });

const canEdit = () =>
  ketoCheck([[{ namespace: '<M>', permit: 'edit', id: 'param.id' }]],
            { onDeny: 'FORBIDDEN' });

app.get('/:id', canView(), handler);
app.patch('/:id', canView(), canEdit(), zValidator(…), handler);
app.delete('/:id', canView(), canEdit(), handler);
app.post('/:id/share', canView(), canEdit(), zValidator(…), handler);
```

Four rules, each of which has already gone wrong somewhere:

- **`permissions` is `[[ ]]`** — outer list OR, inner list AND, the namespace
  written out in every term, the same grammar as nxgt-federation's `@check`
  and over the same evaluator in `stx-sdk/ory`. `[[]]` is a conjunction over no
  terms, so it is vacuously true and admits everyone; `ketoCheck` refuses it
  when the module loads rather than letting it become an incident. `id` is
  `param.<name>`, `query.<name>` or `json.<path>`, and a list value requires
  the permit on every element.
- **The order of the two is the 404→403 ladder.** `view` first means a stranger
  cannot probe an id; `edit` second means a viewer, who already knows the
  object is there, gets an honest 403.
- **Carry `message:` wherever the access layer answers a domain message.** The
  route is guarded twice, and two different words behind one 404 tell the
  caller which layer refused — the one thing a 404 exists to hide.
- **Nothing on `/search`, `QUERY /` or `POST /`.** A list is a Keto query
  folded into the Mongo filter before the read, not a check; creation has no
  object yet.

**By default, no `rules.yaml`.** It said `authenticated: true` and nothing
else, which `requireAuthenticated()` says on a prefix — and mounting it there
closed a real hole: a path the file did not name was `NOT_APPLICABLE`, which
means open. In bookmarks-api that path was `GET /bookmarks/:id/share`.

Since `@nxgt/security` 2.0.0 a rules file can say more than that boolean: a
REST rule carries a `keto` list in the same `[[A, B], [C]]` grammar, rungs and
all, so the ladder above is expressible declaratively. It is an **alternative**
to `ketoCheck()`, chosen once per app — never half-mixed. The `NOT_APPLICABLE`
hazard is unchanged, so a file only ever goes on a prefix, beside (not instead
of) `requireAuthenticated()`. bookmarks-api carries both on purpose, as a
bench: its route specs pass only while the two say the same thing. It is the
only app that should.

The GraphQL side has the same term since 3.0.0 — see
`create-ory-native-graphql-api`, where notes-api plays the same role.

### nxgt-ory's `config/keto.namespaces.ts` — your namespace
```ts
class <M> implements Namespace {
  related: { owners: (User | SubjectSet<Group, 'members'>)[]; viewers: (User | SubjectSet<Group, 'members'>)[] };
  permits = {
    edit: (ctx: Context) => this.related.owners.includes(ctx.subject),
    view: (ctx: Context) => this.related.viewers.includes(ctx.subject) || this.permits.edit(ctx),
  };
}
```
Relations are *written*, permits are *asked*. Then:
```sh
curl -sf -X POST localhost:4469/opl/syntax/check --data-binary @../nxgt-ory/config/keto.namespaces.ts
cd ../nxgt-ory && bun docker restart keto && curl -s localhost:4466/namespaces
```
Never lint nxgt-ory's `config/` with Biome `--write`: it reformats
`identity.schema.json`. (nxgt-ory's own `biome.json` now enforces this; the
rule is repeated here because the trap is reached from this side.)

### `src/modules/<m>/<m>.access.ts`
```ts
export async function require<M>Access(id, caller: OryPrincipal | null | undefined, relation: 'view' | 'edit' = 'view') {
  const result = await resolve<M>Access(id, caller);          // edit? owner : view? viewer : null
  if (!result) throw CustomException.notFound({ message: '<m>.errors.not-found' });   // no view → 404, never 403
  if (relation === 'edit' && result.access !== 'owner')
    throw CustomException.forbidden({ message: 'errors.insufficient-permissions' }); // viewer asking edit → 403
  return result;
}
```
Called from the **service**, never from a route. `caller` is `ctx.get('ory')`;
read `.subject`, not `principal.id`, when the value goes to Keto.

### `src/modules/<m>/<m>.service.ts`
- `create`: `super.create()`, then `grant(id, 'owners', caller.subject)`;
  if the grant fails, delete the document (an object without its owners tuple
  is unreadable by everyone). After, not inside — the mutex is not reentrant.
- list: `heldBy(caller.subject)` → ids → `$and: [{ _id: { $in: ids } }, <client filter>]`.
  AND-ed, never OR-ed. Decorate each row with `myAccess` from the same map.
- `share(id, { subjectId | email })`: `require<M>Access(id, caller, 'edit')`,
  resolve the email through **`identities.findByEmail(email)`**
  (`createIdentityAdmin` from `stx-sdk/ory/admin`, constructed in
  `src/config/ory.ts`), refuse self, `grant(id, 'viewers', target)`.

  **Never `kratosAdmin.GET('/admin/identities', …)` read straight.**
  `openapi-fetch` leaves `data` undefined on any non-2xx, so that call turns a
  Kratos outage into "share target not found" — a 404 for an outage, in the one
  stack whose founding rule is that unavailable is never a denial. Both
  reference APIs shipped that bug. `findByEmail` answers `null` only when
  Kratos ANSWERED and had nobody.
- `<m>.integrity.ts`: cascade delete → `revokeAll`, registered in
  `integrityRegistry`, so a Keto outage fails the delete instead of leaving
  tuples on an id a future document could occupy.

### `openapi/`
Security schemes shared in `@nxgt/shared-openapi`, `$ref`'d from the app's own
`node_modules` (`../../node_modules/@nxgt/shared-openapi/openapi/components/security/…`,
depth relative to the app root — Bun's isolated linker does not hoist)
(`OrySession` cookie + `Bearer`). Every response type carries `myAccess`.

---

## Environment
`src/env.ts`: the five Ory URLs with `localhost` defaults, and nothing else
Ory-related — there is no gateway to point at. `.env.development`
holds only the app's own values (`MONGODB_URI` composed from the system
vars, `NODE_ENV`); `.env.test` its port and `-test` database. `docker/shared.env`
already carries the container names. The compose healthcheck is `/health`,
which does **not** prove the Ory URLs arrived — a container without
`shared.env` is "healthy" and answers 503 on everything else.

## Docker
`Dockerfile` = oauth-api's archetype (builder on `sellix/bun`, runtime on
`oven/bun:alpine`, the bundle alone — **no `rules.yaml` to copy**, and nothing
read from disk at startup). One
`apps/<product>/docker-compose.yaml` for the group, next free IP, Traefik
labels as in `apps/bookmarks/docker-compose.yaml`. `oxfile.toml` entry.

## Testing
One route spec against the live Keto and Hydra — **nothing about
authorization is mocked**. Actors: `mockUser()` + `X-User-*` headers (honoured
by `oryAuth()` in `NODE_ENV=test`; the id becomes the subject) and a real
`client_credentials` token from Hydra sent as Bearer (`sub` = client id).
Assert against Keto's own answer (`isAllowed`) as well as the HTTP status.
Run-unique subjects; sweep the tuples in `afterAll` (`clearDatabase()` skips
the cascade). Run one file, from the app, with the host prefix:

```sh
env -u MONGODB_URI KRATOS_PUBLIC_URL=http://localhost:4433 KETO_READ_URL=http://localhost:4466 \
  KETO_WRITE_URL=http://localhost:4467 HYDRA_ADMIN_URL=http://localhost:4445 \
  NODE_ENV=test bun --env-file=.env.test test src/modules/<m>/<m>.routes.spec.ts
```

Prove three things at least: the owner's tuple exists after create; a
stranger gets **404** (not 403) by id and does not see it in the list; a
viewer gets **403** on an edit and loses `view` after unshare.

---

## Documentation (mandatory — part of the same branch)
1. `README.md` — running it, an endpoints table with the **Needs** column
   (`signed in` / `view` / `edit`), non-goals (no user table, no authorities,
   not behind the **oauth** gateway — and no gateway at all).
2. `docs/README.md` (one picture of the request), `01-authentication.md`,
   `02-authorization.md` (404 vs 403, who writes tuples, how a list is
   built), `03-troubleshooting.md` — **every entry a failure that actually
   happened**, symptom → cause → fix.
3. `AGENTS.md` — the imperative, pointing at `docs/` for the why. Its last
   section is this list.
4. Root `CLAUDE.md` — add the app's `AGENTS.md` to the per-app list.
5. nxgt-ory's `README.md` — one row in the consumers table. **Another repo:
   its own PR.**
6. `stx-sdk/docs/ory/` — only if you changed the shared module.

---

## Steps
1. `cd ../nxgt-ory && bun run setup`; confirm `curl localhost:4466/namespaces`.
2. Add the namespace to nxgt-ory's `config/keto.namespaces.ts`; syntax-check;
   restart Keto. **That is a commit in nxgt-ory, not here** — land it first,
   because nothing in this repo compiles against it and nothing warns you.
   That repo has a skill for this step, `change-stack-config`; load it rather
   than editing the file from memory.
3. Copy `apps/bookmarks/bookmarks-api` to `apps/<product>/<product>-api`;
   rename `bookmarks` → `<m>` everywhere; pick a free port (`ss -ltn`,
   `oxfile.toml`) and test port.
4. Write `openapi/`, `bun run codegen`, then models / types / access /
   tuples / service / integrity / routes, with `ketoCheck()` on every route
   naming one object.
5. `bun run typecheck`, `bunx biome check --write .`, the route spec against
   the live stack.
6. `bun run build` and boot the binary once; `curl` 401 / 404 / 403 by hand.
7. Dockerfile, compose, `oxfile.toml`; `docker compose config --quiet`.
8. Documentation, all six items above.
9. PR to `develop` per `large-feature-branch-workflow`.

## Checklist before finishing
- [ ] One `createOry()`; `ketoWrite` imported by `src/ory/tuples.ts` only, and guarded by `noRestrictedImports`
- [ ] `src/ory/tuples.ts` is a `createTuples({ … })` call, not hand-written calls
- [ ] The share-by-email lookup is `identities.findByEmail`, not a bare `kratosAdmin.GET`
- [ ] No `rules.yaml` (the default); `requireAuthenticated()` on `/api/*` answers 401
- [ ] `oryChecks(ory)` after `oryAuthentication()` and before `servicesProvider()`
- [ ] `ketoCheck()` on every route naming one object — `view` then `edit` — and **none** on `/search`, `QUERY /` or `POST /`
- [ ] Every `view` check carries the same `message:` key the access layer uses
- [ ] `require<M>Access` takes the context's checker, not `ory`; answers 404 for no `view`, 403 for `view` without `edit`
- [ ] `create` grants owners after the document and rolls back on failure; delete cascades to `revokeAll`
- [ ] `withOryUnavailable` on `onError`; no `catch` turns an outage into anonymous or empty
- [ ] Spec asserts against Keto, sweeps tuples, uses run-unique subjects
- [ ] Namespace names in OPL and `tuples.ts` agree
- [ ] README + docs/ + AGENTS.md + CLAUDE.md list + nxgt-ory's `README.md` row
- [ ] No route reads an `X-User-*`, `X-Roles` or `X-Claims` header from the wire — nothing fronts this API, so nothing erases them; `NODE_ENV=test` is the only gate that may honour one
