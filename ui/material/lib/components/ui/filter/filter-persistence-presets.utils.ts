import type { FilterPreset } from './types';

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

// ============================================================================
// Preset Storage
// ============================================================================

/**
 * Save presets to storage
 */
export function savePresets(
	strategy: 'localStorage' | 'sessionStorage',
	storageKey: string,
	presets: FilterPreset[],
): boolean {
	const storage = getStorage(strategy);
	if (!storage) return false;

	try {
		storage.setItem(storageKey, JSON.stringify(presets));
		return true;
	} catch (error) {
		console.error('Failed to save presets to storage:', error);
		return false;
	}
}

/**
 * Load presets from storage
 */
export function loadPresets(
	strategy: 'localStorage' | 'sessionStorage',
	storageKey: string,
): FilterPreset[] | null {
	const storage = getStorage(strategy);
	if (!storage) return null;

	try {
		const data = storage.getItem(storageKey);
		if (!data) return null;
		return JSON.parse(data) as FilterPreset[];
	} catch (error) {
		console.error('Failed to load presets from storage:', error);
		return null;
	}
}

/**
 * Clear presets from storage
 */
export function clearPresets(
	strategy: 'localStorage' | 'sessionStorage',
	storageKey: string,
): boolean {
	const storage = getStorage(strategy);
	if (!storage) return false;

	try {
		storage.removeItem(storageKey);
		return true;
	} catch (error) {
		console.error('Failed to clear presets from storage:', error);
		return false;
	}
}
