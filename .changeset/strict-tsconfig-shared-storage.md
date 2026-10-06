---
'@nxgt/shared-storage': patch
---

Class fields are now emitted with define semantics (`MinioService`, `StorageService`, `GridFSService`), and `StorageService` passes `ensureExists` `{}` instead of `{ bucket: undefined }`.
