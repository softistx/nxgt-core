import type { DateRangeFilter } from '@/models';

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
