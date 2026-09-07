# @nxgt/edge

An authenticating reverse proxy that decides with the parc's own rules engine.

It authenticates a request once, asks whether the caller may reach the app at
all, and forwards it with a signed assertion the app verifies locally. It reads
the same `rules.yaml` a fronted API runs on its own routes — so there is one
policy language in the parc, not two.

It keeps one rule above all others: **unavailable is never anonymous and never
denied**. An identity provider that cannot answer is a **503**, never a 401 and
never a 403. That is the whole reason this exists, and there is a section at
the end saying what it cost to learn.

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

Routing and policy are separate documents, and the separation is load-bearing.
Put them in one rule and a route's method list doubles as routing, so a method
nobody thought of — `QUERY` — becomes *unroutable* rather than merely
unauthorised. Match without the host and `/health` becomes a rule that exists
for every fronted app at once or for none, since they all serve that path.

`routes.yaml` says **where**:

```yaml
apps:
  - name: bookmarks
    match: { prefix: "/api" }           # matched on segment boundaries
    upstream: "${BOOKMARKS_API_URL}"    # expanded: one document, every env
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

**`mirror`** — decide, record, and forward the request **unchanged** to
whatever is still answering. Nothing is minted (that upstream authenticates the
caller itself and cannot do it with an assertion of ours), nothing is refused,
and the edge's own failure is a log line and a passed-through request.

That last property is the point: **a change cannot break what already works
while you are measuring it.** `mirrorUpstream` is any URL — an older deployment
of this edge, another proxy, the app itself — so this is how you try a new
authenticator, a reworked rules document or a newly fronted app against real
traffic before it decides anything.

**`enforce`** — decide and act: refuse, or forward with a signed assertion.

Going live is one variable, and it cannot be half done: `mirror` without an
upstream and `enforce` with one are both refused at construction.

A mirror record carries the status the edge *would* have answered beside the
one the upstream actually gave, and a verdict. When the edge would answer a
status of its own the comparison is exact; when it would forward, only the
refusals an edge is capable of making (401, 403, 503) read as disagreement,
because from outside a 403 the upstream produced and a 403 the *app* produced
look identical. So it watches the network path on live traffic — it does not
prove equivalence. A recorded corpus does that.

## Headers

**Erased inbound, unconditionally**: every name in `USER_HEADERS`
(`X-User-*`, `X-Roles`, `X-Scopes`, `X-Client-Id`, `X-Claims`, `X-Name`) and
every `X-Forwarded-*`. The list is derived from `USER_HEADERS`, not typed out,
so it cannot fall behind. This is not hypothetical: `currentUser()` in sellix's
`apps/services/*` builds a full principal — id, email, **authorities**,
**roles** — out of exactly those headers, gated by nothing at all.

**Set outbound**: `Authorization: Bearer <assertion>` (replacing the caller's
own), `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `Host`.

**Passed through**: everything else, `Cookie` included, deliberately. A fronted
app stays correct on its own address, and one that reads the session cookie
there must keep working behind the edge. Stripping it is a hardening of its
own, checked app by app.

**On the way back**: `Set-Cookie` via `getSetCookie()`, never
`get('set-cookie')`, which folds several cookies into one string no browser
accepts.

## Statuses

| | |
| --- | --- |
| Kratos / Hydra unreachable | **503** |
| Keto unreachable | **503** |
| Keto says no | 403 |
| anonymous on a closed path | 401 |
| a request no rule names | 404 |
| upstream unreachable | 502 |
| the edge's own failure, in `mirror` | logged, forwarded |

A refusal splits on whether a rule matched at all. One that did says 401 or
403 — the caller reached the app, so nothing is revealed by telling them
whether they may have it. One that did **not** says **404**. Inviting an
anonymous caller to authenticate for a path that routes nowhere costs them a
round trip to learn nothing is there, and a 403 would confirm the path exists
to someone probing for it.

Bodies are the parc's `{ status, message, debugMessage, timestamp }`, **not
translated**: the edge has no locale contract with the caller and no
catalogue, and inventing one would make an edge refusal and an app refusal read
differently for the same reason. The caller's own layer knows the locale.

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

## Why it exists

It replaced Ory Oathkeeper, and it was written for one **measured** defect:
with Kratos down, Oathkeeper answered **403**. Indistinguishable from a real
refusal — a UI reads it as *you may not* when the truth is *nobody could ask*,
and the caller has no reason to retry. Its `cookie_session` authenticator has
no retry and its error handler no status table; `stx-sdk/ory` throws
`OryUnavailable` rather than returning `false`, so on this side the defect
never existed.

The second reason was structural: Oathkeeper's `access-rules` document is a
different policy language from `@nxgt/security`'s `rules.yaml`, and the two had
to be kept in agreement by hand across a whole parc.

Two more things worth keeping, because both were found by **asking a running
Oathkeeper rather than reading its configuration**, and both contradict what
that configuration looks like:

- it authenticates a **CORS preflight** like any other request, and a browser
  preflight carries neither cookie nor `Authorization` by design — so the real
  request is never made at all;
- `GET /health` could not be routed, because every fronted app serves that
  exact path and a second matching rule made it refuse outright.

The lesson generalises past this package: **record what a system answers, do
not transcribe what its configuration implies.** The corpus that proved this
edge equivalent was recorded, not written, and it produced two answers its
author had predicted wrongly.
