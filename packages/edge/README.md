# @nxgt/edge

An authenticating reverse proxy that decides with the parc's own rules engine.

It is a replacement for Ory Oathkeeper, and it exists for one measured defect:
**with Kratos down, Oathkeeper answers 403**. That is indistinguishable from a
real refusal, and it breaks the rule every API in the parc already keeps —
*unavailable is never anonymous and never denied*. `stx-sdk/ory` throws
`OryUnavailable` rather than returning `false`, so here the same outage is a
**503**.

Along the way it removes the second rules engine. Oathkeeper's `access-rules`
document is a different language from `@nxgt/security`'s `rules.yaml`, and the
two are kept in agreement by hand. This edge reads a `rules.yaml`.

## What it is not

It never decides about an **object**. The edge answers *who is this caller* and
*may they reach this app at all* — `App:<name>#use` — and nothing else. Whether
a caller may see a particular bookmark is the API's question: only the API has
the context to answer it, and to answer 404 where 403 would leak that the
object exists.

That boundary is enforced at startup, not documented: a rules document whose
Keto terms name anything but `param.app` refuses to boot.

## Shape

```ts
import { createEdge } from '@nxgt/edge';
import { oryAuthenticator } from '@nxgt/edge/authenticators/ory';
import { parse } from 'yaml';

const edge = createEdge({
  mode: env.EDGE_MODE,                  // 'mirror' | 'enforce'
  routes: parse(await Bun.file(env.EDGE_ROUTES).text()),
  rules: parse(await Bun.file(env.EDGE_RULES).text()),
  mirrorUpstream: env.EDGE_MIRROR_UPSTREAM,   // mirror mode only
  authenticators: [
    oryAuthenticator({
      ory,
      signer: { issuer: env.EDGE_ISSUER_URL, jwks: await keySet() },
    }),
  ],
});

Bun.serve({ port: 4455, fetch: (request, server) =>
  edge.fetch(request, server.requestIP(request)?.address) });
```

It is a plain `fetch` handler, not a framework app. A proxy's job is to touch
the request as little as possible, and the one middleware chain that would be
tempting — `policyGuard` — clones and buffers every JSON body to make a
decision the edge is not allowed to base on a body anyway.

## Two documents, not one

Oathkeeper puts routing and policy in the same rule, and that conflation is
where two of its traps come from: a rule's `methods` list doubles as routing,
so `QUERY` is unroutable rather than merely unauthorised; and a host-agnostic
`match.url` makes `/health` a rule that exists for every fronted app or for
none.

Here `routes.yaml` says **where**:

```yaml
apps:
  - name: bookmarks
    match: { prefix: "/api" }           # matched on segment boundaries
    upstream: "${BOOKMARKS_API_URL}"    # expanded — Oathkeeper does not
  - name: notes
    match: { host: "notes.${HOST}", path: "/graphql" }
    upstream: "${NOTES_API_URL}"
```

and `edge-rules.yaml` says **who**, in the vocabulary every app already uses:

```yaml
global:
  unmatched: deny
rest:
  /health:
    GET: { public: true }
  /api{/*rest}:
    GET: &use
      keto:
        - permissions: [[{ namespace: App, permit: use, id: param.app }]]
          onDeny: FORBIDDEN
    POST: *use
    QUERY: *use
```

Two documents can disagree, so they are checked against each other at startup:
an app that is routable and unnamed would have every request refused with a
reason that says only "no rule matched".

## What it refuses to start with

| | why |
| --- | --- |
| `global.unmatched` not `deny` | inside an app an unnamed path still meets the authentication floor and the route itself; at an edge it is a path forwarded with no decision made about it at all |
| a Keto term reading `json.…` | an edge that buffers every body to decide is an edge that holds every upload in memory |
| a Keto term naming anything but `param.app` | the boundary above |
| a routable app no rule names | the two documents disagreeing, silently and totally |
| `mirror` with no `mirrorUpstream`, or `enforce` with one | a half-done switchover |

## Modes

**`mirror`** — decide, record, and forward the request **unchanged** to the
edge being replaced, which still answers. Nothing is minted (the mirrored edge
needs the caller's own credential), nothing is refused, and the edge's own
failure is a log line and a passed-through request. An edge under evaluation
must not be able to break what already works.

**`enforce`** — decide and act: refuse, or forward with a signed assertion.

Switching is one variable. The verdict a mirror record carries (`agree` /
`differ` / `error`) is coarse on purpose — from outside, a 403 the mirrored
edge produced and a 403 the *app* produced look identical — so it is for
watching the network path on live traffic, not for proving equivalence. That
is the differential harness's job, against a recorded corpus.

## Headers

**Erased inbound, unconditionally**: every name in `USER_HEADERS`
(`X-User-*`, `X-Roles`, `X-Scopes`, `X-Client-Id`, `X-Claims`, `X-Name`) and
every `X-Forwarded-*`. The list is derived from `USER_HEADERS`, not typed out,
so it cannot fall behind. This is not hypothetical: `currentUser()` in sellix's
`apps/services/*` builds a full principal — id, email, **authorities**,
**roles** — out of exactly those headers, gated by nothing at all.

**Set outbound**: `Authorization: Bearer <assertion>` (replacing the caller's
own), `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `Host`.

**Passed through**: everything else, `Cookie` included. Deliberate and
temporary — Oathkeeper forwards it, and a second rail that changes what crosses
is not a comparison. Stripping it is a separate hardening once the edge is
enforcing.

**On the way back**: `Set-Cookie` via `getSetCookie()`, never
`get('set-cookie')`, which folds several cookies into one string no browser
accepts.

## Statuses

| | Oathkeeper | here |
| --- | --- | --- |
| Kratos / Hydra unreachable | **403** | **503** |
| Keto unreachable | 500 | **503** |
| Keto says no | 403 | 403 |
| anonymous on a closed path | 401 | 401 |
| upstream unreachable | 502 | 502 |
| edge's own failure, `mirror` | — | logged, forwarded |

Bodies are the parc's `{ status, message, debugMessage, timestamp }`, **not
translated**: the edge has no locale contract with the caller and no
catalogue, and inventing one would make an edge refusal and an app refusal read
differently for the same reason. Oathkeeper's own 401 is untranslated too.

## Authenticators

An interface with one implementation, and that is on purpose. `resolve` returns
`null` for a caller it does not recognise — anonymous, a legitimate answer —
and **throws `AuthorityUnavailable`** when the authority could not be asked.
Returning `null` there is the defect the whole package exists to fix.

`@nxgt/edge/authenticators/ory` is the only module that imports `stx-sdk`, and
it is its own entrypoint for that reason: the core has no opinion about
identity, so an edge in front of a parc with no Ory never loads it and never
installs the optional peer.

## Install

```sh
bun add @nxgt/edge
bun add stx-sdk   # only if you use the Ory authenticator
```
