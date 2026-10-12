---
"@nxgt/shared-storage": patch
---

`StorageService.fetch` reads a key with a space, a `%` or a non-ASCII character. It answered a non-ok 404 `Response` for such a key, which `ensureExists` had just found, because Bun's `s3://` fetch misses it. It now fetches a URL presigned for the request's method, so `Range` and `HEAD` work as before. A method that cannot be signed is a `fetch-failed`. `S3_CREDENTIALS` lives in its own module, which ends the import cycle between `minio.service` and `storage.service`; it is still exported from the same place.
