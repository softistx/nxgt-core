---
'@nxgt/shared-mongo': patch
'@nxgt/shared-storage': patch
'@nxgt/shared-events': patch
---

Ship READMEs that name the traps, not just the install.

`@nxgt/shared-mongo` now says the REST and GraphQL filter helpers share
names with incompatible meanings (`buildArrayFilter` is exact-match vs
`$in`). `@nxgt/shared-storage` now says `createLazyStorage` must be a
module-level const, `StorageService` fires an unawaited bucket check in
its constructor, and the four `S3_*` variables default to a local MinIO
rather than failing closed.
`@nxgt/shared-events` now says adding an event is a release before it is
a consumer change.
