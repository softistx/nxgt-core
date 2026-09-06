import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { delay } from '@nxgt/shared';
import { StorageService } from './storage.service';

const image = Bun.file('src/assets/images/stylish-spectacles.webp');
const filename = image.name || '';

let service: StorageService;

describe('StorageService', () => {
	beforeAll(() => {
		service = new StorageService();
	});
	afterAll(async () => {
		if (await service.exists(filename)) {
			await service.delete(filename);
		}
	});
	describe('write', async () => {
		test('Should write a file to S3', async () => {
			await service.write(filename, image);
			expect(await service.exists(filename)).toBeTrue();
			expect((await service.stat(filename)).size).toBeGreaterThan(0);
		});

		test('Should override a file in S3', async () => {
			await service.write(filename, image);
			const stat1 = await service.stat(filename);
			await delay(1000);
			await service.write(filename, image);
			const stat2 = await service.stat(filename);
			expect(stat1.lastModified.getTime()).toBeLessThan(
				stat2.lastModified.getTime(),
			);
		});
	});

	describe('delete', () => {
		test('Should delete a file from S3', async () => {
			await service.write(filename, image);
			expect(await service.exists(filename)).toBeTrue();
			await service.delete(filename);
			expect(await service.exists(filename)).toBe(false);
		});
		test('Should throw an error if the file does not exist', async () => {
			expect(service.delete('non-existent-file')).rejects.toThrow(
				'storage.errors.delete-failed',
			);
		});
	});
});
