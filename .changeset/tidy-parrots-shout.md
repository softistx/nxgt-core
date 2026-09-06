---
'@nxgt/shared-openapi': major
---

Drop the sort vocabulary from the shared OpenAPI components.

`SearchRequest` advertised a `sort` array, and `SortField`, `SortOrder` and
`SortDirection` shipped to describe it. Nothing ever honoured it. The paginator
every one of those bodies feeds is `Model.cursorPaginate` in
`@nxgt/shared-mongo`, which orders by `_id` and never reads `sort` — the cursor
*is* the `_id`. Twenty-three endpoints across six sellix services took the
parameter, documented it, and threw it away; five of them went as far as
building a Mongo sort object before dropping it on the floor.

`SearchRequest` now carries `filter` alone, and the three sort schemas are
deleted.

A consumer that `$ref`s any of the four must remove the reference — with
`no-unused-components: error`, Redocly will point at every one. A consumer that
sends `sort` in a request body validated with `.strict()` now gets a 400 instead
of a silently unsorted page, which is the point.

Add the schemas back the day a paginator honours them, with compound cursors,
next to the code that reads them.
