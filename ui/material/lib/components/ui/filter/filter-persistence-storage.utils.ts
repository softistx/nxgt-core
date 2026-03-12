import { cleanFilterValues } from './filter-value.utils';
import type { FilterValues } from './types';

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Get storage instance based on strategy
 */
function getStorage(
	strategy: 'localStorage' | 'sessionStorage',
): Storage | null {
	if (typeof window === 'undefined') return null;

	try {
		const storage = strategy === 'localStorage' ? localStorage : sessionStorage;
		// Test if storage is available
		const testKey = '__storage_test__';
		storage.setItem(testKey, 'test');
		storage.removeItem(testKey);
		return storage;
	} catch {
		return null;
	}
}

/**
 * Create storage key with version
 */
function createStorageKey(baseKey: string, version?: number): string {
	return version ? `${baseKey}_v${version}` : baseKey;
}

// ============================================================================
// Filter Values Storage
// ============================================================================

/**
 * Save filter values to localStorage/sessionStorage
 */
export function saveToStorage(
	strategy: 'localStorage' | 'sessionStorage',
	storageKey: string,
	values: FilterValues,
	version?: number,
): boolean {
	const storage = getStorage(strategy);
	if (!storage) return false;

	try {
		const key = createStorageKey(storageKey, version);
		const cleaned = cleanFilterValues(values);
		storage.setItem(key, JSON.stringify(cleaned));
		return true;
	} catch (error) {
		console.error('Failed to save filters to storage:', error);
		return false;
	}
}

/**
 * Load filter values from localStorage/sessionStorage
 */
export function loadFromStorage(
	strategy: 'localStorage' | 'sessionStorage',
	storageKey: string,
	version?: number,
): FilterValues | null {
	const storage = getStorage(strategy);
	if (!storage) return null;

	try {
		const key = createStorageKey(storageKey, version);
		const data = storage.getItem(key);
		if (!data) return null;
		return JSON.parse(data) as FilterValues;
	} catch (error) {
		console.error('Failed to load filters from storage:', error);
		return null;
	}
}

/**
 * Clear filter values from localStorage/sessionStorage
 */
export function clearFromStorage(
	strategy: 'localStorage' | 'sessionStorage',
	storageKey: string,
	version?: number,
): boolean {
	const storage = getStorage(strategy);
	if (!storage) return false;

	try {
		const key = createStorageKey(storageKey, version);
		storage.removeItem(key);
		return true;
	} catch (error) {
		console.error('Failed to clear filters from storage:', error);
		return false;
	}
}
