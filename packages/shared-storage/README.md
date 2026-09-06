# @nxgt/shared-storage

Object storage over MinIO/S3: the storage service, the GridFS bridge, upload
validation and the file model.

Its specs skip themselves unless all four of `S3_ENDPOINT`, `S3_BUCKET`,
`S3_USER` and `S3_PASSWORD` are set — infrastructure that is absent is not a
failing test.

`StorageService`'s constructor fires an unawaited bucket-existence check, so
construct it lazily rather than at module scope if the process may start before
the bucket does.

## Install

```bash
bun add @nxgt/shared-storage
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
