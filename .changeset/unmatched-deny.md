---
'@nxgt/security': minor
---

`global.unmatched: deny` — the rules file as an exhaustive statement

A rules document can now say that a REST path no rule names is refused rather
than let through. `allow` stays the default and every existing document keeps
its behaviour exactly.

The decision is taken in `evaluateRest`, not in each guard, so `policyGuard`,
a gateway's per-service guards and a dry-run `POST /evaluate` inherit it and
cannot disagree about the same request. The refusal is the ladder that already
exists — UNAUTHENTICATED for an anonymous caller, DENY otherwise — so nothing
new reaches a UI, and `reason` names both the path and the flag, because a 403
on a route nobody thought was guarded is otherwise a long afternoon.

It is not a security fix: in this parc every unnamed path turned out to be
covered by `secured()` or by an authentication floor. It is the mechanism that
makes those other layers visible, and that turns "this file is incomplete and I
know it" — a real comment in a real production document — into a startup
failure.

Turn it on only once the file is exhaustive, and `unnamedOperations(policy,
paths)` ships alongside it so that "exhaustive" is a number rather than a
feeling: every operation in an OpenAPI `paths` object that no rule names. It
asks the compiled matchers directly, so there are no claims to invent and no
Keto evaluator to stub. Run it from the app's own suite, get it to zero, set
the flag, and it stays at zero.

**`unmatched` is REST-only, and `compilePolicy` throws rather than pretend
otherwise.** `applyGraphqlPolicy` never wraps a field no rule names, so no
default could reach it; making one apply would mean wrapping every field of
every type and enumerating the whole schema to boot. A document carrying both
`global.unmatched: deny` and a `graphql:` block is refused with a message
saying so.
