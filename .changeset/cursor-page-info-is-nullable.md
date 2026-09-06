---
"@nxgt/shared-openapi": minor
---

`CursorPageInfo` declares `startCursor` and `endCursor` as nullable, which is
what the API actually returns. `@nxgt/shared-mongo`'s `cursorPaginate` answers
`null` for both on an empty page — it has always done so — while this schema
promised a string or nothing. Every client generated from it was wrong about
the one case it is most likely to meet, and no consumer noticed because the
mismatch only surfaces where a route's return type is annotated.
