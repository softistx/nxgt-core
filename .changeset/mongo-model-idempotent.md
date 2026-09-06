---
"@nxgt/shared-mongo": patch
---

The `Migration` model no longer throws when its module is evaluated twice in
one process. `model('Migration', …)` ran at import and mongoose answers
`OverwriteModelError` the second time — at import, before any code of yours
runs — so a consumer bundling two entry points that both reach it, or a test
run loading several files, crashed on a name collision with itself. It now
reuses the compiled model when there is one.
