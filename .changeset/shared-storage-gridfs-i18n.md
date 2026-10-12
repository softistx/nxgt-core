---
"@nxgt/shared-storage": patch
---

`resources` now translate GridFSService's `files.errors.file-not-found` and `files.errors.file-not-found-after-rename`, which used to show as raw keys, and the French resources say every `storage.errors.*` message in French; all but one were left in English.
