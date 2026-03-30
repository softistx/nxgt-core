import type { DateRangeFilter, StringArrayFilter } from '@nxgt/shared/models';
import type { QueryFilter } from 'mongoose';

/**
 * Helper to build MongoDB date range filter from DateRangeFilter
 * @param dateRange - The date range filter with from and to dates
 * @returns MongoDB date range filter ($gte and/or $lte)
 */
export function buildDateRangeFilter(dateRange: DateRangeFilter | undefined) {
	if (!dateRange) {
		return undefined;
	}

	const filter: any = {};

	if (dateRange.from) {
		filter.$gte = new Date(dateRange.from);
	}

	if (dateRange.to) {
		filter.$lte = new Date(dateRange.to);
	}

	return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Helper to build MongoDB filter from ArrayFilter
 * @param arrayFilter - The array filter with values and operator
 * @returns MongoDB filter query ($in or $all)
 */
export function buildArrayFilter(arrayFilter?: StringArrayFilter | null) {
	if (!arrayFilter?.values) {
		return undefined;
	}

	return arrayFilter.operator === 'and'
		? { $all: arrayFilter.values }
		: arrayFilter.values;
}

/**
 * Helper to add a filter condition to a query object
 */
export function addFilterCondition(
	query: QueryFilter<any>,
	field: string,
	condition: any,
): void {
	if (condition) {
		query[field] = condition;
	}
}

export function buildRegexFilter(field: string, value: string | undefined) {
	if (value) {
		return { [field]: { $regex: value, $options: 'i' } };
	}
	return undefined;
}
