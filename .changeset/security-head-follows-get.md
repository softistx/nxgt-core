---
"@nxgt/security": patch
---

A HEAD request is checked against the GET rule as well as its own: servers answer HEAD by running the GET route, so a HEAD request passes only when the GET evaluation for its path allows it — the `global.unmatched` fallback included — and its `HEAD` rule, when one matches, allows it too. A rules file that names only `GET` covers HEAD; a `HEAD` entry can restrict that, never relax it. `evaluateRest`, and so `policyGuard`, and `unnamedOperations` all apply this.
