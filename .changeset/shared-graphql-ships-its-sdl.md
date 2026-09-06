---
'@nxgt/shared-graphql': minor
---

Ship the shared `.graphqls` in the tarball.

The package's SDL — the `Void` scalar, the filter inputs, the shared object
types — lived under `src/`, which `files` excludes, so a consumer installing
from the registry got the resolvers without the types they resolve. It now
lives in `graphql/` at the package root and is published.

`SHARED_SCHEMA_PATH` points at it. It used to be `join(__dirname, './**/*.graphqls')`,
which resolved to `dist/` in a published package and to `src/utils/` in the
workspace — neither holds any SDL. It now walks up to the package root, which
is the one anchor both layouts share.
