import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive } from 'bun';
import { hasS3 } from '../test/has-s3';
import { MinioService } from './minio.service';
import { S3_CREDENTIALS, StorageService } from './storage.service';

// Every run writes under its own prefix, so `listObjects` sees only what this
// file wrote and a crashed run leaves nothing a later one trips over.
const prefix = `minio-spec/${crypto.randomUUID()}`;
const keyFor = (name: string) => `${prefix}/${name}`;

/** The text of an object, read through the minio SDK's stream. */
async function read(minio: MinioService, key: string): Promise<string> {
	const stream = await minio.getObject(key);
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString();
}

/** Every item a minio listing stream yields. */
async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
	const items: T[] = [];
	for await (const item of stream) {
		items.push(item);
	}
	return items;
}

// `convert` is pure: it needs no S3, so it runs everywhere.
describe('MinioService.convert', () => {
	const minio = new MinioService();
	const text = 'converted';
	const bytes = new TextEncoder().encode(text);
	const padded = new TextEncoder().encode(`xx${text}yy`);

	test.each([
		['a Blob', () => new Blob([text])],
		['a File', () => new File([text], 'f.txt')],
		['a Response', () => new Response(text)],
		[
			'a Request',
			() => new Request('http://x.invalid', { method: 'POST', body: text }),
		],
		['an ArrayBuffer', () => bytes.slice().buffer],
		['a Uint8Array', () => bytes],
		[
			'a view on part of a larger buffer',
			() => new Uint8Array(padded.buffer, 2, text.length),
		],
	] as const)('turns %s into a Buffer', async (_, body) => {
		const converted = await minio.convert(body());
		expect(Buffer.isBuffer(converted)).toBeTrue();
		expect((converted as Buffer).toString()).toBe(text);
	});

	test('passes a string and a Buffer through', async () => {
		expect(await minio.convert(text)).toBe(text);
		const buffer = Buffer.from(text);
		expect(await minio.convert(buffer)).toBe(buffer);
	});

	test('turns an Archive into the bytes of its tarball', async () => {
		const archive = new Archive({ 'a.txt': text });
		const converted = await minio.convert(archive);
		expect(Buffer.isBuffer(converted)).toBeTrue();
		expect((converted as Buffer).length).toBe((await archive.blob()).size);
	});
});

describe.skipIf(!hasS3)('MinioService', () => {
	let minio: MinioService;
	let storage: StorageService;
	let dir: string;
	const buckets: string[] = [];

	beforeAll(async () => {
		minio = new MinioService();
		storage = new StorageService();
		dir = await mkdtemp(join(tmpdir(), 'minio-spec-'));
	});

	afterAll(async () => {
		const objects = await collect(await minio.listObjects(prefix, true));
		for (const object of objects) {
			if (object.name) {
				await minio.deleteObject(object.name);
			}
		}
		for (const bucket of buckets) {
			await minio.minio.removeBucket(bucket).catch(() => {});
		}
		await rm(dir, { recursive: true, force: true });
	});

	describe('putObject and getObject', () => {
		test('round-trips an object with its metadata', async () => {
			const key = keyFor('put.txt');
			const result = await minio.putObject(key, 'Hello, Minio!', undefined, {
				'Content-Type': 'text/plain',
				owner: 'Strange',
			});
			expect(result.etag).toBeString();
			expect(await read(minio, key)).toBe('Hello, Minio!');
			const stat = await minio.minio.statObject(S3_CREDENTIALS.bucket, key);
			expect(stat.metaData['content-type']).toBe('text/plain');
			expect(stat.metaData['owner']).toBe('Strange');
		});

		test('reads what StorageService wrote', async () => {
			const key = keyFor('storage.txt');
			await storage.write(key, 'Hello, Storage Service!');
			expect(await read(minio, key)).toBe('Hello, Storage Service!');
		});

		test('rejects a missing key with the SDK error, untranslated', async () => {
			await expect(
				minio.getObject(keyFor('missing.txt')),
			).rejects.toMatchObject({ code: 'NoSuchKey' });
		});
	});

	describe('fPutObject and fGetObject', () => {
		test('uploads a file and downloads it to another', async () => {
			const key = keyFor('file.txt');
			const source = join(dir, 'source.txt');
			const target = join(dir, 'target.txt');
			await writeFile(source, 'from disk');
			await minio.fPutObject(key, source, { 'Content-Type': 'text/plain' });
			await minio.fGetObject(key, target);
			expect(await readFile(target, 'utf8')).toBe('from disk');
		});
	});

	describe('findUploadId', () => {
		test('finds no multipart upload for a plain object', async () => {
			const key = keyFor('upload-id.txt');
			await minio.putObject(key, 'single part');
			expect(await minio.findUploadId(key)).toBeFalsy();
		});
	});

	describe('copyObject', () => {
		test('copies an object within the bucket', async () => {
			const source = keyFor('copy-source.txt');
			const destination = keyFor('copy-destination.txt');
			await minio.putObject(source, 'copied');
			await minio.copyObject({ Object: source }, { Object: destination });
			expect(await read(minio, destination)).toBe('copied');
		});
	});

	describe('deleteObject', () => {
		test('deletes an object', async () => {
			const key = keyFor('delete.txt');
			await minio.putObject(key, 'gone');
			await minio.deleteObject(key);
			expect(await storage.exists(key)).toBeFalse();
		});
	});

	describe('listObjects and listObjectsV2', () => {
		test('list the objects under a prefix, recursively', async () => {
			const key = keyFor('list/one.txt');
			await minio.putObject(key, 'one');
			const listPrefix = keyFor('list/');
			const v1 = await collect(await minio.listObjects(listPrefix, true));
			const v2 = await collect(await minio.listObjectsV2(listPrefix, true));
			expect(v1.map((object) => object.name)).toEqual([key]);
			expect(v2.map((object) => object.name)).toEqual([key]);
		});
	});

	describe('presignedGetObject and presignedPutObject', () => {
		test('sign a PUT that uploads and a GET that serves it', async () => {
			const key = keyFor('presigned.txt');
			const put = await minio.presignedPutObject(key, 60);
			const uploaded = await fetch(put, { method: 'PUT', body: 'presigned' });
			expect(uploaded.status).toBe(200);
			const response = await fetch(await minio.presignedGetObject(key, 60));
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('presigned');
		});

		test('signs a GET whose response-header overrides reach the response', async () => {
			const key = keyFor('disposition.txt');
			await minio.putObject(key, 'attachment');
			const url = await minio.presignedGetObject(key, 60, {
				'response-content-disposition': 'attachment; filename="x.txt"',
			});
			const response = await fetch(url);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-disposition')).toBe(
				'attachment; filename="x.txt"',
			);
		});
	});

	describe('buckets', () => {
		test('bucketExists is true for the configured bucket', async () => {
			expect(await minio.bucketExists()).toBeTrue();
		});

		test('ensureBucketExists creates a missing bucket, then leaves it', async () => {
			const bucket = `minio-spec-${crypto.randomUUID().slice(0, 8)}`;
			buckets.push(bucket);
			expect(await minio.bucketExists(bucket)).toBeFalse();
			await minio.ensureBucketExists(bucket);
			expect(await minio.bucketExists(bucket)).toBeTrue();
			await minio.ensureBucketExists(bucket);
			expect(await minio.bucketExists(bucket)).toBeTrue();
		});
	});
});
