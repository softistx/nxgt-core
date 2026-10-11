import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { delay } from '@nxgt/shared';
import { CustomException } from '@nxgt/shared-exceptions';
import { translate } from '../i18n';
import { hasS3 } from '../test/has-s3';
import { MinioService } from './minio.service';
import { S3_CREDENTIALS, StorageService } from './storage.service';

// Resolved from this file, not from the working directory: `bun test` runs from
// the workspace root, where a relative path lands nowhere.
const image = Bun.file(
	new URL('../assets/images/stylish-spectacles.webp', import.meta.url),
);

// Every run writes under its own prefix, so a crashed run leaves nothing a
// later one trips over, and `list` sees only what this file wrote.
const prefix = `storage-spec/${crypto.randomUUID()}`;
const keyFor = (name: string) => `${prefix}/${name}`;
const missing = keyFor('missing.txt');
// A second bucket, for `fetch`'s `bucket` option. Created explicitly before the
// first write — only some S3s (SeaweedFS) create one on write — and removed
// after.
const OTHER_BUCKET = 'nxgt-test-other';

/** The rejection of `promise`, or a failure if it resolved. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error('expected a rejection, got a value');
}

/** The exception `run` throws, or a failure if it returned. */
function thrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	throw new Error('expected a throw, got a value');
}

/** A real S3 error, translated: a `CustomException` 500 with the method's key. */
function expectInternal(error: unknown, message: string) {
	expect(error).toBeInstanceOf(CustomException);
	const exception = error as CustomException<string>;
	expect(exception.code).toBe(500);
	expect(exception.message).toBe(message);
	expect(exception.debugMessage).toBeString();
	expect(exception.debugMessage).not.toBe('');
}

/** A missing key: a 404 carrying the message key and its parameter. */
function expectNotFound(error: unknown, key: string) {
	expect(error).toBeInstanceOf(CustomException);
	const exception = error as CustomException<string>;
	expect(exception.code).toBe(404);
	expect(exception.message).toBe('storage.errors.file-not-found');
	expect(exception.options).toEqual({ key });
}

/**
 * A second instance built while the secret is wrong: every request it signs is
 * refused by the real S3, which is the SDK error the service must translate.
 * `S3_CREDENTIALS` is read by the constructor, so it is put back at once.
 */
function misconfigured(): StorageService {
	const secret = S3_CREDENTIALS.secretAccessKey;
	S3_CREDENTIALS.secretAccessKey = 'not-the-secret';
	try {
		return new StorageService();
	} finally {
		S3_CREDENTIALS.secretAccessKey = secret;
	}
}

describe.skipIf(!hasS3)('StorageService', () => {
	let service: StorageService;
	let broken: StorageService;
	const buckets: string[] = [];

	beforeAll(() => {
		service = new StorageService();
		broken = misconfigured();
	});

	afterAll(async () => {
		const listed = await service.list({ prefix });
		for (const object of listed.contents ?? []) {
			await service.s3.delete(object.key);
		}
		for (const bucket of buckets) {
			await service.minio.minio.removeBucket(bucket).catch(() => {});
		}
	});

	describe('write', () => {
		const key = keyFor('write.webp');

		test('writes a file and returns the bytes written', async () => {
			const written = await service.write(key, image);
			expect(written).toBe(image.size);
			expect(await service.exists(key)).toBeTrue();
		});

		test('overwrites an existing file', async () => {
			await service.write(key, image);
			const before = await service.stat(key);
			await delay(1000);
			await service.write(key, 'replaced');
			const after = await service.stat(key);
			expect(after.lastModified.getTime()).toBeGreaterThan(
				before.lastModified.getTime(),
			);
			expect(after.size).toBe('replaced'.length);
		});

		test('turns an SDK error into storage.errors.write-failed', async () => {
			expectInternal(
				await rejection(broken.write(keyFor('refused.txt'), 'x')),
				'storage.errors.write-failed',
			);
		});
	});

	describe('list', () => {
		test('lists what was written under a prefix', async () => {
			const key = keyFor('list/one.txt');
			await service.write(key, 'one');
			const listed = await service.list({ prefix: keyFor('list/') });
			expect(listed.contents?.map((object) => object.key)).toEqual([key]);
		});

		test('lists nothing under a prefix that holds nothing', async () => {
			const listed = await service.list({ prefix: keyFor('nothing/') });
			expect(listed.contents ?? []).toEqual([]);
		});

		test('turns an SDK error into storage.errors.list-failed', async () => {
			expectInternal(
				await rejection(broken.list({ prefix })),
				'storage.errors.list-failed',
			);
		});
	});

	describe('file', () => {
		test('returns a handle that reads the stored content', async () => {
			const key = keyFor('file.txt');
			await service.write(key, 'content');
			expect(await service.file(key).text()).toBe('content');
		});

		test('returns a handle on a missing key without throwing', async () => {
			expect(await service.file(missing).exists()).toBeFalse();
		});

		test('turns an SDK error into storage.errors.file-failed', () => {
			expectInternal(
				thrown(() => service.file(undefined as unknown as string)),
				'storage.errors.file-failed',
			);
		});
	});

	describe('exists', () => {
		test('is true for a stored key', async () => {
			const key = keyFor('exists.txt');
			await service.write(key, 'here');
			expect(await service.exists(key)).toBeTrue();
		});

		test('is false for a missing key', async () => {
			expect(await service.exists(missing)).toBeFalse();
		});

		test('turns an SDK error into storage.errors.exists-failed', async () => {
			expectInternal(
				await rejection(broken.exists(missing)),
				'storage.errors.exists-failed',
			);
		});
	});

	describe('presing', () => {
		test('signs a URL that serves the stored content', async () => {
			const key = keyFor('presign.txt');
			await service.write(key, 'signed');
			const response = await fetch(service.presing(key));
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('signed');
		});

		test('signs a URL for a missing key, which the S3 answers with 404', async () => {
			const response = await fetch(service.presing(missing));
			expect(response.status).toBe(404);
		});

		test('turns an SDK error into storage.errors.presign-failed', () => {
			expectInternal(
				thrown(() => service.presing('')),
				'storage.errors.presign-failed',
			);
		});
	});

	describe('delete', () => {
		test('deletes a stored file', async () => {
			const key = keyFor('delete.txt');
			await service.write(key, 'gone');
			await service.delete(key);
			expect(await service.exists(key)).toBeFalse();
		});

		test('rejects a missing key with a 404, not delete-failed', async () => {
			expectNotFound(await rejection(service.delete(missing)), missing);
		});

		test('turns an SDK error into storage.errors.delete-failed', async () => {
			expectInternal(
				await rejection(broken.delete(missing)),
				'storage.errors.delete-failed',
			);
		});
	});

	describe('size', () => {
		test('returns the size of a stored file', async () => {
			const key = keyFor('size.txt');
			await service.write(key, '12345');
			expect(await service.size(key)).toBe(5);
		});

		test('rejects a missing key with a 404', async () => {
			expectNotFound(await rejection(service.size(missing)), missing);
		});

		test('turns an SDK error into storage.errors.size-failed', async () => {
			expectInternal(
				await rejection(broken.size(missing)),
				'storage.errors.size-failed',
			);
		});
	});

	describe('stat', () => {
		test('returns the stat of a stored file', async () => {
			const key = keyFor('stat.txt');
			await service.write(key, 'stat', { type: 'text/plain' });
			const stat = await service.stat(key);
			expect(stat.size).toBe(4);
			expect(stat.type).toStartWith('text/plain');
		});

		test('rejects a missing key with a 404', async () => {
			expectNotFound(await rejection(service.stat(missing)), missing);
		});

		test('turns an SDK error into storage.errors.stat-failed', async () => {
			expectInternal(
				await rejection(broken.stat(missing)),
				'storage.errors.stat-failed',
			);
		});
	});

	describe('unlink', () => {
		test('removes a stored file', async () => {
			const key = keyFor('unlink.txt');
			await service.write(key, 'gone');
			await service.unlink(key);
			expect(await service.exists(key)).toBeFalse();
		});

		test('rejects a missing key with a 404', async () => {
			expectNotFound(await rejection(service.unlink(missing)), missing);
		});

		test('turns an SDK error into storage.errors.unlink-failed', async () => {
			expectInternal(
				await rejection(broken.unlink(missing)),
				'storage.errors.unlink-failed',
			);
		});
	});

	describe('fetch', () => {
		test('fetches a stored file through s3://', async () => {
			const key = keyFor('fetch.txt');
			await service.write(key, 'fetched');
			const response = await service.fetch(key);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('fetched');
		});

		test('fetches from the bucket named in its options', async () => {
			buckets.push(OTHER_BUCKET);
			// Before the service exists: its constructor fires its own unawaited
			// ensureBucketExists, which would race a second one.
			await new MinioService(OTHER_BUCKET).ensureBucketExists(OTHER_BUCKET);
			const other = new StorageService(OTHER_BUCKET);
			const key = keyFor('fetch-other.txt');
			await other.write(key, 'elsewhere');
			try {
				const response = await service.fetch(key, { bucket: OTHER_BUCKET });
				expect(response.status).toBe(200);
				expect(await response.text()).toBe('elsewhere');
			} finally {
				await other.s3.delete(key);
			}
		});

		test('fetches without S3_BUCKET in the environment', async () => {
			const key = keyFor('fetch-no-env-bucket.txt');
			await service.write(key, 'no env bucket');
			const { S3_BUCKET: _omitted, ...environment } = Bun.env;
			const script = `
				import { StorageService } from ${JSON.stringify(new URL('./storage.service.ts', import.meta.url).href)};
				const storage = new StorageService(${JSON.stringify(S3_CREDENTIALS.bucket)});
				const response = await storage.fetch(${JSON.stringify(key)});
				console.log('RESULT', response.status, await response.text());
			`;
			const child = Bun.spawn(['bun', '-e', script], {
				env: environment,
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const [out, err] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			expect(err).toBe('');
			// The logger shares stdout, so the result is the line that says so.
			expect(out.split('\n')).toContain('RESULT 200 no env bucket');
		});

		test('rejects a missing key with a 404', async () => {
			expectNotFound(await rejection(service.fetch(missing)), missing);
		});

		test('turns an SDK error into storage.errors.fetch-failed', async () => {
			expectInternal(
				await rejection(broken.fetch(missing)),
				'storage.errors.fetch-failed',
			);
		});
	});

	describe('the not-found message', () => {
		test('is a key, translated once by whoever renders it', async () => {
			const error = (await rejection(
				service.size(missing),
			)) as CustomException<string>;
			expect(
				translate(
					error.message as 'storage.errors.file-not-found',
					error.options,
				),
			).toBe(`File '${missing}' not found in storage.`);
		});
	});
});
