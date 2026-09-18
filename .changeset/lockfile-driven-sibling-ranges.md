---
'@nxgt/shared-graphql': patch
'@nxgt/shared-hono': patch
---

Ask for `@nxgt/security@^4.0.0`, the major these packages are actually built
against.

`workspace:^` is substituted at pack time from `bun.lock`, not from the
sibling's `package.json`. `changeset version` rewrites the manifests and leaves
the lockfile alone, so 2.0.0 and 3.0.0 went to the registry asking for
`@nxgt/security@^3.2.1` while their `dist` imported the 4.0.0 API. A consumer
installed both majors: the 3.2.1 copy still reaches `stx-sdk/ory`, so
`OryUnavailable` crossed a class boundary and a Kratos or Keto outage answered
500 instead of 503.

`changeset:version` now runs `bun install`, and `verify:artifacts` fails a
tarball whose sibling range excludes the sibling being published beside it.
