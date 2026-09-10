# @nxgt/shared-storage

Object storage over MinIO/S3: `StorageService`, the GridFS bridge, and
`createLazyStorage`.

```ts
import { createLazyStorage } from '@nxgt/shared-storage';

const getStorage = createLazyStorage(process.env.S3_BUCKET);
```

`createLazyStorage` must be bound to a **module-level** `const`, not a class
field: a per-request service that stored the getter on `this` would construct a
new `StorageService` every time the field initializer ran.

## Things that bite

- **`StorageService`'s constructor fires an unawaited bucket-existence check.**
  Construct it lazily if the process may start before the bucket does. An
  unhandled rejection from that check takes the process down; the constructor
  catches and logs, but only after it has already been called.
- **`S3_ENDPOINT`, `S3_BUCKET`, `S3_USER`, `S3_PASSWORD` are read at import
  and default to a local MinIO** (`host.docker.internal:9000` / `minio` /
  `minio123` / `uploads`). A process that forgets to set them does not fail
  closed — it talks to that. Specs skip themselves unless all four are set;
  infrastructure that is absent is not a failing test, and CI has no S3.

## Install

```bash
bun add @nxgt/shared-storage
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
