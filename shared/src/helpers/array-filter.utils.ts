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

	// Use $all for 'and' operator (all values must match)
	// Use $in for 'or' operator (any value must match)
	const operator = arrayFilter.operator === 'and' ? '$all' : '$in';

	return { [operator]: arrayFilter.values };
}
