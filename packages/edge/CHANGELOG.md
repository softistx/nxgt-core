# @nxgt/edge

## 0.1.1

### Patch Changes

- [#47](https://github.com/softistx/nxgt-core/pull/47) [`13858d2`](https://github.com/softistx/nxgt-core/commit/13858d201fe1a77053beb977882902c1acdaabbe) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A request no rule names is 404, not 401
  
  Found by the differential harness in nxgt-ory, which drives a corpus at the
  edge and compares it to what Ory Oathkeeper was **recorded** answering. Two
  probes diverged, and on both Oathkeeper was right: a path that routes nowhere,
  and a method no rule lists, are 404 there and were 401 here.
  
  Inviting an anonymous caller to authenticate for a path that routes nowhere
  costs them a round trip to learn nothing is there, and answering 403 to a named
  caller says the path exists. A refusal from a rule that DID match keeps 401 and
  403 — there the caller already reached the app, so nothing is revealed by
  telling them whether they may have it.
  
  `statusOf` takes an `isNamed` flag, defaulting to `true`; the decision loop
  asks the compiled matchers directly.

## 0.1.0

### Minor Changes

- [#45](https://github.com/softistx/nxgt-core/pull/45) [`b9b91b1`](https://github.com/softistx/nxgt-core/commit/b9b91b10e39ad4c1eec72a9be56dff780b072827) Thanks [@SteveGT96](https://github.com/SteveGT96)! - An authenticating reverse proxy that decides with the parc's own rules engine
  
  A replacement for Ory Oathkeeper, and it exists for one measured defect: with
  Kratos down, Oathkeeper answers **403**. That is indistinguishable from a real
  refusal, and it breaks the rule every API in the parc already keeps —
  *unavailable is never anonymous and never denied*. `stx-sdk/ory` throws
  `OryUnavailable` rather than returning `false`, so here the same outage is a
  **503**, and an unreachable upstream is a 502 rather than the same thing again.
  
  It also removes the second rules engine. Oathkeeper's `access-rules` document
  is a different language from `@nxgt/security`'s `rules.yaml`, kept in agreement
  by hand; this edge reads a `rules.yaml`, with `global.unmatched: deny` — the
  flag that made an edge possible at all.
  
  **It never decides about an object.** The edge answers *who is this caller* and
  *may they reach this app* — `App:<name>#use`. Whether they may see a particular
  bookmark stays in the API, which has the context to answer it and to answer 404
  where 403 would leak that the object exists. Enforced at startup, not
  documented: a document whose Keto terms name anything but `param.app` refuses
  to boot, as does one that would read a request body, one that is not closed by
  default, and one that leaves a routable app unnamed.
  
  **Routing and policy are two documents**, where Oathkeeper conflates them. That
  conflation is where two of its traps come from: a rule's `methods` list doubles
  as routing, so `QUERY` is unroutable rather than merely unauthorised, and a
  host-agnostic `match.url` makes `/health` a rule that exists for every fronted
  app or for none. Here the method travels verbatim and `${VAR}` in an upstream is
  expanded, which Oathkeeper does not do.
  
  **Inbound `USER_HEADERS` are erased**, from a list derived from `USER_HEADERS`
  itself so it cannot fall behind. `currentUser()` in sellix's `apps/services/*`
  builds a full principal — id, email, authorities, roles — out of exactly those
  headers, gated by nothing.
  
  Ships in `mirror` mode: decide, record, and forward the request unchanged to the
  edge being replaced, which still answers. Nothing is minted, nothing is refused,
  and the edge's own failure is a log line and a passed-through request. Switching
  to `enforce` is one variable.
  
  `@nxgt/edge/authenticators/ory` is the only module that imports `stx-sdk`, so an
  edge in front of a parc with no Ory never loads it.

### Patch Changes

- Updated dependencies [[`2163604`](https://github.com/softistx/nxgt-core/commit/216360404ccea2373a109b3c8b7718119da64c72)]:
  - @nxgt/security@3.2.0
