import {
	clearFromStorage,
	loadFromStorage,
	saveToStorage,
} from './filter-persistence-storage.utils';
import {
	loadFromUrl,
	updateUrlWithFilters,
} from './filter-persistence-url.utils';
import type {
	FilterPersistenceConfig,
	FilterSchema,
	FilterValues,
} from './types';

// ============================================================================
// Main Persistence Functions
// ============================================================================

/**
 * Save filter values based on persistence config
 */
export async function persistFilterValues(
	config: FilterPersistenceConfig,
	schema: FilterSchema,
	values: FilterValues,
): Promise<void> {
	if (!config.enabled) return;

	switch (config.strategy) {
		case 'localStorage':
		case 'sessionStorage':
			saveToStorage(
				config.strategy,
				config.storageKey || 'filter-values',
				values,
				config.version,
			);
			break;

		case 'url':
			if (config.urlParams?.enabled) {
				updateUrlWithFilters(schema, values, config.urlParams.prefix);
			}
			break;

		case 'custom':
			if (config.customStorage?.save) {
				await config.customStorage.save(values);
			}
			break;
	}
}

/**
 * Load filter values based on persistence config
 */
export async function loadPersistedFilterValues(
	config: FilterPersistenceConfig,
	schema: FilterSchema,
): Promise<FilterValues | null> {
	if (!config.enabled) return null;

	switch (config.strategy) {
		case 'localStorage':
		case 'sessionStorage':
			return loadFromStorage(
				config.strategy,
				config.storageKey || 'filter-values',
				config.version,
			);

		case 'url':
			if (config.urlParams?.enabled) {
				if (config.urlParams.parseUrl) {
					const searchParams = new URLSearchParams(window.location.search);
					return config.urlParams.parseUrl(searchParams);
				}
				return loadFromUrl(schema, config.urlParams.prefix);
			}
			return null;

		case 'custom':
			if (config.customStorage?.load) {
				return (await config.customStorage.load()) || null;
			}
			return null;

		default:
			return null;
	}
}

/**
 * Clear persisted filter values
 */
export async function clearPersistedFilterValues(
	config: FilterPersistenceConfig,
): Promise<void> {
	if (!config.enabled) return;

	switch (config.strategy) {
		case 'localStorage':
		case 'sessionStorage':
			clearFromStorage(
				config.strategy,
				config.storageKey || 'filter-values',
				config.version,
			);
			break;

		case 'url':
			if (config.urlParams?.enabled && typeof window !== 'undefined') {
				const url = new URL(window.location.href);
				const prefix = config.urlParams.prefix || 'f_';
				const keysToRemove: string[] = [];
				url.searchParams.forEach((_value, key) => {
					if (key.startsWith(prefix)) {
						keysToRemove.push(key);
					}
				});
				for (const key of keysToRemove) {
					url.searchParams.delete(key);
				}
				window.history.pushState({}, '', url.toString());
			}
			break;

		case 'custom':
			if (config.customStorage?.clear) {
				await config.customStorage.clear();
			}
			break;
	}
}
