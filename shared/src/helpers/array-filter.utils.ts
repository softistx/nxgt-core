import type { StringArrayFilter } from '../models';

/**
 * Helper to build MongoDB filter from ArrayFilter
 * @param arrayFilter - The array filter with values and operator
 * @returns MongoDB filter query ($in or $all)
 */
export function buildArrayFilter(arrayFilter: StringArrayFilter | undefined) {
	if (!arrayFilter?.values) {
		return undefined;
	}

	return arrayFilter.operator === 'and'
		? { $all: arrayFilter.values }
		: arrayFilter.values;
}
