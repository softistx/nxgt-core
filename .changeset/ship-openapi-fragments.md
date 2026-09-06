---
"@nxgt/shared-openapi": minor
---

The package now ships its `openapi/` fragments, not just `dist/`. They are half
of what it is for: 296 spec files in `sellix-monorepo` `$ref` into
`openapi/components/**` by relative path, and with the tarball carrying only
`dist/` there was nothing for them to point at once the packages moved out of
the monorepo. 56 files, 224 KB.
