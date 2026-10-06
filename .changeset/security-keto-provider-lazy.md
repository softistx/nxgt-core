---
"@nxgt/security": patch
---

`policyGuard` and `applyGraphqlPolicy` now call the `permissions` provider only when the matched rule carries a `keto` term, once per request or field resolution. Before, they called it on every request (every policed field), so `ketoPermissions()` failed with "a rule carries a `keto` check" on routes and fields that ask Keto nothing when `oryChecks(ory)` / `useKetoChecks(ory)` was not mounted for them. A rule that does carry a `keto` term still fails with that error.
