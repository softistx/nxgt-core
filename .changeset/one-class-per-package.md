---
'@nxgt/shared-events': patch
'@nxgt/security': patch
'@nxgt/shared': patch
'@nxgt/env': patch
---

Entry points share one copy of what they have in common

`build.ts` ran `Bun.build` without `splitting`, so a module imported by two
entry points was inlined into **both** bundles. For these four packages that was
27% of the JavaScript this workspace publishes — `@nxgt/shared-events` alone now
emits ten shared chunks where it previously carried ten duplicates.

No class was duplicated here, which is the only reason this is a patch and not
an incident. The same setting in nxgt-ory gave `@nxgt/ory-sdk` two
`OryUnavailable` classes, one per entry point, so an `instanceof` between them
was false and nine routes answered 500 where they meant 503 — through a green
build, a green typecheck, and a `verify:artifacts` that loaded every subpath.

`verify:artifacts` now refuses a tarball that defines any class in more than one
entry bundle, so the day one of these packages grows a shared class it is a
failed check rather than a runtime surprise in a consumer.
