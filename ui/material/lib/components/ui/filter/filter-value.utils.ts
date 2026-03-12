import type { FilterField, FilterValue, FilterValues } from './types';

/**
 * Check if a filter value is empty/falsy
 */
export function isFilterValueEmpty(value: FilterValue): boolean {
	if (value === null || value === undefined || value === '') {
		return true;
	}

	if (Array.isArray(value)) {
		return value.length === 0;
	}

	if (typeof value === 'object') {
		// Check for range objects
		if ('min' in value || 'max' in value) {
			return value.min === undefined && value.max === undefined;
		}
		if ('start' in value || 'end' in value) {
			return value.start === undefined && value.end === undefined;
		}
		return Object.keys(value).length === 0;
	}

	return false;
}

/**
 * Count the number of active (non-empty) filters
 */
export function countActiveFilters(values: FilterValues): number {
	return Object.values(values).filter((value) => !isFilterValueEmpty(value))
		.length;
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters(values: FilterValues): boolean {
	return countActiveFilters(values) > 0;
}

/**
 * Check if two filter values are equal
 */
export function areFilterValuesEqual(
	value1: FilterValue,
	value2: FilterValue,
): boolean {
	if (value1 === value2) return true;
	if (value1 === null || value2 === null) return false;
	if (value1 === undefined || value2 === undefined) return false;

	// Array comparison
	if (Array.isArray(value1) && Array.isArray(value2)) {
		if (value1.length !== value2.length) return false;
		return value1.every((v, i) => v === value2[i]);
	}

	// Object comparison (ranges)
	if (typeof value1 === 'object' && typeof value2 === 'object') {
		const keys1 = Object.keys(value1);
		const keys2 = Object.keys(value2);
		if (keys1.length !== keys2.length) return false;
		return keys1.every(
			(key) =>
				value1[key as keyof typeof value1] ===
				value2[key as keyof typeof value2],
		);
	}

	return false;
}

/**
 * Check if filter values have changed
 */
export function haveFiltersChanged(
	values1: FilterValues,
	values2: FilterValues,
): boolean {
	const keys1 = Object.keys(values1);
	const keys2 = Object.keys(values2);

	// Quick check: different number of keys
	if (keys1.length !== keys2.length) return true;

	// Check each key
	for (const key of keys1) {
		if (!(key in values2)) return true;
		if (!areFilterValuesEqual(values1[key], values2[key])) return true;
	}

	return false;
}

/**
 * Remove empty values from filter values
 */
export function cleanFilterValues(values: FilterValues): FilterValues {
	const cleaned: FilterValues = {};

	for (const [key, value] of Object.entries(values)) {
		if (!isFilterValueEmpty(value)) {
			cleaned[key] = value;
		}
	}

	return cleaned;
}

/**
 * Format filter value for display
 */
export function formatFilterValue(
	field: FilterField,
	value: FilterValue,
): string {
	if (isFilterValueEmpty(value)) {
		return '';
	}

	switch (field.type) {
		case 'text':
		case 'number':
			return String(value);

		case 'select':
		case 'radio-group': {
			const option = field.options?.find((opt) => opt.value === value);
			return option?.label || String(value);
		}

		case 'multi-select':
		case 'checkbox-group': {
			if (!Array.isArray(value)) return '';
			const labels = value
				.map((v) => {
					const option = field.options?.find((opt) => opt.value === v);
					return option?.label || String(v);
				})
				.filter(Boolean);
			return labels.join(', ');
		}

		case 'switch':
			return value ? 'Yes' : 'No';

		case 'date':
			if (value instanceof Date) {
				return value.toLocaleDateString();
			}
			return String(value);

		case 'date-range': {
			if (typeof value !== 'object' || value === null) return '';
			const range = value as { start?: Date | string; end?: Date | string };
			const start = range.start
				? range.start instanceof Date
					? range.start.toLocaleDateString()
					: String(range.start)
				: '';
			const end = range.end
				? range.end instanceof Date
					? range.end.toLocaleDateString()
					: String(range.end)
				: '';
			if (start && end) return `${start} - ${end}`;
			if (start) return `From ${start}`;
			if (end) return `Until ${end}`;
			return '';
		}

		case 'number-range': {
			if (typeof value !== 'object' || value === null) return '';
			const range = value as { min?: number; max?: number };
			if (range.min !== undefined && range.max !== undefined) {
				return `${range.min} - ${range.max}`;
			}
			if (range.min !== undefined) return `From ${range.min}`;
			if (range.max !== undefined) return `Up to ${range.max}`;
			return '';
		}

		default:
			return String(value);
	}
}
