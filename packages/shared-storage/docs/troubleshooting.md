# Troubleshooting `@nxgt/shared-storage`

Each entry is headed by the message you see, then says when it happens, why,
and the fix. A `StorageService` failure is a `CustomException`: its `message`
is a translation key, and the SDK's own text is in `debugMessage`.

- [A key shown instead of a sentence](#storageerrorsfetch-failed)
- [`fetch` refuses the request](#storageservicefetch-cannot-sign-a-method-request)
- [Not found](#storageerrorsfile-not-found)
- [Any other `storage.errors.*` key](#any-other-storageerrors-key)
- [Environment](#nothing-fails-but-the-wrong-storage-answers)
- [GridFS](#database-connection-not-established)

## `storage.errors.fetch-failed`

**When.** `storage.fetch(key, options)` rejects with a 500 whose `message` is
this key.
**Why.** the key exists, but the request could not be built or the network
call failed. `debugMessage` says which; the three refusals below are the ones
you can cause yourself.
**Fix.** read `debugMessage` first. A refusal is fixed in the call (below); a
network error means the endpoint is unreachable from this process.

If the key itself is shown to users, merge the package's translations, or the
key is rendered as is:

```ts
import { resources } from '@nxgt/shared-storage';
// spread resources.en / resources.fr into your translator
```

### `StorageService.fetch cannot sign a <METHOD> request`

**When.** `fetch` is called with a `method` other than `GET`, `HEAD`, `PUT`,
`POST` or `DELETE`, for example `PATCH`. It is the `debugMessage` of
`storage.errors.fetch-failed`.
**Why.** `fetch` sends a URL presigned for the request's method, and S3
presigns only those five. The method is matched case-insensitively and
defaults to `GET`.
**Fix.**

```ts
const response = await storage.fetch('reports/2026.pdf', { method: 'HEAD' });
```

### `StorageService.fetch cannot sign the x-amz-… header: use write`

**When.** `fetch` is given a header starting with `x-amz-` (metadata, an ACL,
a checksum). The header name is in the message.
**Why.** the presigned URL signs only `host`, so S3 answers 403 to an
`x-amz-*` header it did not sign.
**Fix.** set it with `write`, which signs it, and keep `fetch` for reading:

```ts
await storage.write('uploads/a.txt', body, {
	acl: 'private',
});
const response = await storage.fetch('uploads/a.txt', {
	headers: { Range: 'bytes=0-99' },
});
```

### `StorageService.fetch cannot sign the host header: the presigned URL sets it`

Also `…the authorization header: the presigned URL sets it`.

**When.** `fetch` is given a `Host` or an `Authorization` header.
**Why.** the URL already carries its credentials and is signed for one host;
a second `Authorization`, or another `Host`, is refused by S3.
**Fix.** drop the header. `Range`, `Content-Type`, `signal` and a `PUT`'s
`body` go through unchanged.

## `storage.errors.file-not-found`

**When.** `delete`, `size`, `stat`, `unlink` or `fetch` is called with a key
that is not in the bucket. The answer is a 404 `CustomException` with options
`{ key }`, not a 500.
**Why.** each of these first checks the key exists. Also met when the key is
right but the bucket is not: `fetch` reads the constructor's bucket, which
defaults to `S3_BUCKET`.
**Fix.** check the key and the bucket; read from another bucket with the
`bucket` option:

```ts
const response = await storage.fetch('a.txt', { bucket: 'archive' });
```

To test for presence without a 404, call `exists`.

### A 404 for a key with a space, a `%` or an accent (before 1.2.1)

**When.** `storage.fetch('with a space.txt')` answers a non-ok 404 `Response`
although `exists` returns true. Only on `@nxgt/shared-storage` older than
1.2.1.
**Why.** Bun's `s3://` fetch missed such keys, encoded or not.
**Fix.** upgrade to 1.2.1 or later; `fetch` now uses a presigned URL and any
key reads as it was written.

## Any other `storage.errors.*` key

**When.** a method rejects with a 500 whose `message` is one of
`storage.errors.write-failed`, `list-failed`, `file-failed`, `exists-failed`,
`presign-failed`, `delete-failed`, `size-failed`, `stat-failed` or
`unlink-failed`. `file` and `presign` throw synchronously.
**Why.** the S3 call failed: endpoint unreachable, bad credentials, missing
bucket, a refused request. The SDK's text is in `debugMessage` and the error
is logged.
**Fix.** read `debugMessage` and the log line, then check the four variables
below:

```ts
try {
	await storage.write(key, body);
} catch (error) {
	console.error((error as { debugMessage?: string }).debugMessage);
}
```

## Nothing fails but the wrong storage answers

**When.** `S3_ENDPOINT`, `S3_BUCKET`, `S3_USER` or `S3_PASSWORD` is unset.
**Why.** the four are read once, at import, and each defaults to a local
MinIO (`http://host.docker.internal:9000`, `uploads`, `minio`, `minio123`).
Nothing fails closed: you get connection errors as `write-failed` and its
siblings, or you write to a local bucket.
**Fix.** set all four where the process runs, before the package is imported:

```bash
S3_ENDPOINT=https://s3.example.com
S3_BUCKET=acme-uploads
S3_USER=...
S3_PASSWORD=...
```

The schema is made of strings with defaults, so the `Invalid environment
variables` error in `src/env.ts` is not reachable by leaving one out.

## `Database connection not established`

**When.** `new GridFSService()`, or a GridFS method, runs before Mongoose is
connected.
**Why.** it needs `mongoose.connection.db`.
**Fix.**

```ts
import { connect } from '@nxgt/shared-mongo';
import { GridFSService } from '@nxgt/shared-storage';

await connect(process.env.MONGO_URI!);
const files = new GridFSService();
```

GridFS also answers 404 with the keys `files.errors.file-not-found` and
`files.errors.file-not-found-after-rename` (an id that is not in the bucket),
and 400 with `errors.could-not-use-first-and-last-together` (`first` and
`last` passed together to `paginate`). The last one is translated by the
shared `@nxgt/i18n` resources this package's `resources` include; the two
`files.errors.*` keys are not in them yet, so they show as is unless your
translator defines them.

## A slow start, or a rejection at boot

**When.** a `StorageService` is built while the storage is not up.
**Why.** its constructor fires an unawaited bucket check, which logs on
failure.
**Fix.** build it lazily, from a module-level constant:

```ts
import { createLazyStorage } from '@nxgt/shared-storage';

const getStorage = createLazyStorage(process.env.S3_BUCKET!);
```
