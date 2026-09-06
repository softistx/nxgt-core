import { StorageService } from './storage.service';

/**
 * StorageService's constructor fires an unawaited bucket-existence check
 * against S3/MinIO; constructing it eagerly would pay that cost (and risk
 * an unhandled rejection if storage is unreachable) even when no upload
 * feature backed by this bucket is ever touched. Returns a process-lifetime
 * singleton getter — must be bound to a module-level `const`, not a class
 * field, so it survives across per-request service instances.
 */
export function createLazyStorage(bucket: string) {
	let storage: StorageService | undefined;
	return function getStorage() {
		if (!storage) {
			storage = new StorageService(bucket);
		}
		return storage;
	};
}
