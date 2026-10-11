# @nxgt/shared-storage

Object storage over MinIO/S3: `StorageService`, `MinioService`, the GridFS
bridge, and `createLazyStorage`.

## Install

```bash
bun add @nxgt/shared-storage
```

Public on npmjs; no token needed to install. TypeScript is a peer:
`^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set
installs with either.

## Usage

```ts
import {
	createLazyStorage,
	StorageService,
	MinioService,
	GridFSService,
} from '@nxgt/shared-storage';

const getStorage = createLazyStorage(process.env.S3_BUCKET);
await getStorage().write('avatars/1.png', body);
const handle = getStorage().file('avatars/1.png');
```

`createLazyStorage` must be bound to a **module-level** `const`, not a class
field: a per-request service that stored the getter on `this` would construct a
new `StorageService` every time the field initializer ran.

| Export | What it is |
| --- | --- |
| `StorageService` | Bun `S3Client` writes, plus a `MinioService` for bucket admin |
| `MinioService` | the minio SDK: ensure bucket, presign, list |
| `GridFSService` | Mongo GridFS (`paginate`, `upload`, `download`, `findById`, `delete`, `rename`); buckets `avatars`, `uploads`, `images`, `videos`, `files`. The constructor throws if `mongoose.connection.db` is missing — connect first. |
| `createLazyStorage(bucket)` | process-lifetime singleton getter |
| `S3_CREDENTIALS` | `{ endpoint, bucket, accessKeyId, secretAccessKey }` from env |

`StorageService` talks to Bun's `S3Client`: `write`, `list`, `file`, `exists`,
`presing` (presign; the name is spelled that way, and its error key is
`presign-failed`), `delete`, `size`, `stat`, `unlink`, `fetch`. `fetch` takes a
`bucket` option to read from another bucket; it defaults to the constructor's
bucket, itself `S3_BUCKET` by default. MinIO
methods whose result types would otherwise leak minio's internal module are
annotated through the public `Client`
(`Awaited<ReturnType<Client['putObject']>>`) so a consumer's `.d.ts` resolves.

## Errors

Every `StorageService` method rejects (or, for the synchronous `file` and
`presing`, throws) a `CustomException` with code 500 when the S3 call fails.
Its `message` is that method's key, and `debugMessage` holds the SDK's text:

| Method | Message key |
| --- | --- |
| `write` | `storage.errors.write-failed` |
| `list` | `storage.errors.list-failed` |
| `file` | `storage.errors.file-failed` |
| `exists` | `storage.errors.exists-failed` |
| `presing` | `storage.errors.presign-failed` |
| `delete` | `storage.errors.delete-failed` |
| `size` | `storage.errors.size-failed` |
| `stat` | `storage.errors.stat-failed` |
| `unlink` | `storage.errors.unlink-failed` |
| `fetch` | `storage.errors.fetch-failed` |

`delete`, `size`, `stat`, `unlink` and `fetch` first check the key exists. A
missing key is a 404 `storage.errors.file-not-found` with options `{ key }`,
not a 500.

The message is a key, not text: whoever renders the exception translates it
with its `options`. Merge the package's exported `resources` (`en` and `fr`)
into your translator, or the key is shown as is.

```ts
import { resources } from '@nxgt/shared-storage';

// e.g. with i18next: addResourceBundle(lng, ns, ...) for each entry, or
// spread `resources.en` / `resources.fr` into your own resources.
```

## Things that bite

- **`StorageService`'s constructor fires an unawaited bucket-existence check.**
  Construct it lazily if the process may start before the bucket does. An
  unhandled rejection from that check would take the process down; the
  constructor catches and logs, but only after it has already been called.
- **`S3_ENDPOINT`, `S3_BUCKET`, `S3_USER`, `S3_PASSWORD` are read at import
  and default to a local MinIO** (`host.docker.internal:9000` / `minio` /
  `minio123` / `uploads`). A process that forgets to set them does not fail
  closed — it talks to that.
- **Specs skip themselves** unless all four variables are set. Infrastructure
  that is absent is not a failing test, and CI runs them against SeaweedFS.
