---
'@nxgt/shared-storage': patch
---

`StorageService` now throws the exceptions it documents. Each method awaits the SDK call inside its `try`, so a failed S3 call surfaces as a `CustomException` 500 carrying the method's message key instead of the raw SDK error. A missing key stays the 404 `storage.errors.file-not-found` rather than being rewrapped as a 500, and its message is the key with `{ key }` as options, so the handler that renders it no longer translates it twice. `fetch` now requests the object it names: the bucket goes in the S3 options, not in the `s3://` URL, which made every file a 404 when `S3_BUCKET` was set.
