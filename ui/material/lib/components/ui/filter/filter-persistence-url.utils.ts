import { URL_PARAM_SEPARATORS } from './consts';
import { cleanFilterValues, isFilterValueEmpty } from './filter-value.utils';
import type {
	FilterField,
	FilterSchema,
	FilterValue,
	FilterValues,
} from './types';

// ============================================================================
// URL Serialization/Deserialization
// ============================================================================

/**
 * Serialize filter value to URL param string
 */
function serializeFilterValue(
	field: FilterField,
	value: FilterValue,
): string | null {
	if (isFilterValueEmpty(value)) return null;

	switch (field.type) {
		case 'text':
		case 'number':
		case 'select':
		case 'radio-group':
		case 'switch':
			return String(value);

		case 'multi-select':
		case 'checkbox-group':
			if (!Array.isArray(value)) return null;
			return value.join(URL_PARAM_SEPARATORS.ARRAY);

		case 'date':
			if (value instanceof Date) {
				return value.toISOString().split('T')[0]; // YYYY-MM-DD
			}
			return String(value);

		case 'date-range': {
			if (typeof value !== 'object' || value === null) return null;
			const range = value as { start?: Date | string; end?: Date | string };
			const start = range.start
				? range.start instanceof Date
					? range.start.toISOString().split('T')[0]
					: String(range.start)
				: '';
			const end = range.end
				? range.end instanceof Date
					? range.end.toISOString().split('T')[0]
					: String(range.end)
				: '';
			if (start && end) {
				return `${start}${URL_PARAM_SEPARATORS.DATE_RANGE}${end}`;
			}
			if (start) return `${start}${URL_PARAM_SEPARATORS.DATE_RANGE}`;
			if (end) return `${URL_PARAM_SEPARATORS.DATE_RANGE}${end}`;
			return null;
		}

		case 'number-range': {
			if (typeof value !== 'object' || value === null) return null;
			const range = value as { min?: number; max?: number };
			if (range.min !== undefined && range.max !== undefined) {
				return `${range.min}${URL_PARAM_SEPARATORS.RANGE}${range.max}`;
			}
			if (range.min !== undefined) {
				return `${range.min}${URL_PARAM_SEPARATORS.RANGE}`;
			}
			if (range.max !== undefined) {
				return `${URL_PARAM_SEPARATORS.RANGE}${range.max}`;
			}
			return null;
		}

		default:
			return String(value);
	}
}

/**
 * Parse URL param string to filter value
 */
function parseFilterValue(field: FilterField, paramValue: string): FilterValue {
	if (!paramValue) return null;

	switch (field.type) {
		case 'text':
			return paramValue;

		case 'number':
			return Number.parseFloat(paramValue);

		case 'select':
		case 'radio-group':
			return paramValue;

		case 'multi-select':
		case 'checkbox-group':
			return paramValue.split(URL_PARAM_SEPARATORS.ARRAY);

		case 'switch':
			return paramValue === 'true' || paramValue === '1';

		case 'date':
			return new Date(paramValue);

		case 'date-range': {
			const parts = paramValue.split(URL_PARAM_SEPARATORS.DATE_RANGE);
			return {
				start: parts[0] ? new Date(parts[0]) : undefined,
				end: parts[1] ? new Date(parts[1]) : undefined,
			};
		}

		case 'number-range': {
			const parts = paramValue.split(URL_PARAM_SEPARATORS.RANGE);
			return {
				min: parts[0] ? Number.parseFloat(parts[0]) : undefined,
				max: parts[1] ? Number.parseFloat(parts[1]) : undefined,
			};
		}

		default:
			return paramValue;
	}
}

/**
 * Serialize filter values to URL search params
 */
export function serializeToUrlParams(
	schema: FilterSchema,
	values: FilterValues,
	prefix = 'f_',
): URLSearchParams {
	const params = new URLSearchParams();
	const cleaned = cleanFilterValues(values);

	for (const [fieldId, value] of Object.entries(cleaned)) {
		const field = schema.fields.find((f) => f.id === fieldId);
		if (!field) continue;

		const serialized = serializeFilterValue(field, value);
		if (serialized !== null) {
			params.set(`${prefix}${fieldId}`, serialized);
		}
	}

	return params;
}

/**
 * Parse filter values from URL search params
 */
export function parseFromUrlParams(
	schema: FilterSchema,
	searchParams: URLSearchParams,
	prefix = 'f_',
): FilterValues {
	const values: FilterValues = {};

	for (const field of schema.fields) {
		const paramKey = `${prefix}${field.id}`;
		const paramValue = searchParams.get(paramKey);

		if (paramValue !== null) {
			values[field.id] = parseFilterValue(field, paramValue);
		}
	}

	return values;
}

/**
 * Update URL with filter values (without page reload)
 */
export function updateUrlWithFilters(
	schema: FilterSchema,
	values: FilterValues,
	prefix = 'f_',
): void {
	if (typeof window === 'undefined') return;

	try {
		const url = new URL(window.location.href);
		const params = serializeToUrlParams(schema, values, prefix);

		// Remove existing filter params
		const keysToRemove: string[] = [];
		url.searchParams.forEach((_value, key) => {
			if (key.startsWith(prefix)) {
				keysToRemove.push(key);
			}
		});
		for (const key of keysToRemove) {
			url.searchParams.delete(key);
		}

		// Add new filter params
		params.forEach((value, key) => {
			url.searchParams.set(key, value);
		});

		// Update URL without reload
		window.history.pushState({}, '', url.toString());
	} catch (error) {
		console.error('Failed to update URL with filters:', error);
	}
}

/**
 * Load filter values from current URL
 */
export function loadFromUrl(
	schema: FilterSchema,
	prefix = 'f_',
): FilterValues | null {
	if (typeof window === 'undefined') return null;

	try {
		const searchParams = new URLSearchParams(window.location.search);
		return parseFromUrlParams(schema, searchParams, prefix);
	} catch (error) {
		console.error('Failed to load filters from URL:', error);
		return null;
	}
}
