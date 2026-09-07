---
"@nxgt/edge": patch
---

Two defects in the mirror record, found by reading it

Both were visible within a minute of the first live mirror-mode traffic, which
is a fair argument for the mode.

**`/health` was recorded as agreement.** It is routable nowhere and allowed, so
in `enforce` the edge answers it itself — 200, where Oathkeeper says 404, a
declared divergence. But the record said "would forward", because a decision
that does not refuse had no status. It now carries 200, so a total
disagreement no longer reads as agreement. `statusOf` takes an `isRouted` flag,
and `createEdge` refuses on `>= 400` rather than on "not 0".

**A matching pair of statuses was called a disagreement.** The verdict asked
whether the upstream status was in a fixed list of refusals (401, 403, 503),
which 404 was not — so every request neither edge routes, answered 404 by both,
was flagged. When the edge would answer a status of its own the comparison is
now exact; the fixed list applies only when the edge would forward, where it is
a judgement rather than a comparison and the reasoning is written down.
