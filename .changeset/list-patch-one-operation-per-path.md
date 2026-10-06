---
"@nxgt/shared-mongo": patch
"@nxgt/i18n": patch
---

`buildListStringPatch` and `buildListStringPatchUpdate` refuse a patch that gives more than one of `replace`, `add` and `remove`. Those combinations already failed: they named the path under two operators (`$addToSet`, `$pullAll`, or the `$set` a `replace` becomes), and MongoDB refused the whole update with code 40, "Updating the path 'tags' would create a conflict at 'tags'". A schema with the errors plugin answered that with a generic 400 (`errors.something-went-wrong`), and without it the raw `MongoServerError` surfaced. They now fail early, before any query, with a 400 `CustomException` whose message is `errors.list-patch-one-operation-per-path` (added to `@nxgt/i18n` in English and French) and whose `options.path` names the path. An empty array emits nothing and does not count. Send the operations as separate updates, or resolve the whole list with `resolveListStringPatch`. The return type is unchanged.
