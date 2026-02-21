import { beforeAll, describe, expect, test } from 'bun:test';
import { MinioService } from './minio.service';
import { StorageService } from './storage.service';

describe('MinioService', () => {
	let minio: MinioService;
	let storage: StorageService;

	beforeAll(() => {
		minio = new MinioService();
		storage = new StorageService();
	});

	describe('putObject', () => {
		test('should put an object to minio', async () => {
			const key = 'test-object.txt';
			const body = 'Hello, Minio!';
			await minio.putObject(key, body, undefined, {
				'Content-Type': 'text/plain',
				owner: 'Strange',
			});
			const object = await minio.getObject(key);
			const data = (await object.toArray())[0] as Buffer;
			expect(data.toString()).toBe(body);
		});

		test('should put an object to minio using storage service', async () => {
			const key = 'test-object-storage.txt';
			const body = 'Hello, Storage Service!';
			await storage.write(key, body);
			const object = await minio.getObject(key);
			const data = (await object.toArray())[0] as Buffer;
			expect(data.toString()).toBe(body);
		});
	});
});
