---
"@nxgt/edge": patch
---

A request no rule names is 404, not 401

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
