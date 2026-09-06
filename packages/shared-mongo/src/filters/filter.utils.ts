import type { QueryFilter } from 'mongoose';

export type SortDirection = 'ASC' | 'DESC';

export type SortObject = Record<string, SortDirection>;

export type LogicalOperator = 'AND' | 'OR';

export type NumberOperator =
	| 'EQ'
	| 'NE'
	| 'GT'
	| 'GTE'
	| 'LT'
	| 'LTE'
	| 'IN'
	| 'NOT_IN';

export type StringOperator =
	| 'EQ'
	| 'NE'
	| 'CONTAINS'
	| 'STARTS_WITH'
	| 'ENDS_WITH'
	| 'REGEX'
	| 'IN'
	| 'NOT_IN';

export type ArrayOperator = 'ALL' | 'ANY' | 'NONE' | 'EXACT';

export type ObjectIDOperator = 'EQ' | 'NE' | 'IN' | 'NOT_IN' | 'EXISTS';

/**
 * Generic filter types matching GraphQL inputs
 */
export interface StringFilter {
	operator: StringOperator;
	value?: string | null;
	values?: string[] | null;
	caseSensitive?: boolean | null;
}

export interface NumberFilter {
	operator?: NumberOperator | null;
	value?: number | null;
	values?: number[] | null;
}

export interface DateRangeFilter {
	from?: Date | string | null;
	to?: Date | string | null;
	eq?: Date | string | null;
	before?: Date | string | null;
	after?: Date | string | null;
}

export interface ArrayFilter {
	operator?: ArrayOperator | null;
	values: string[];
}

export interface ObjectIDFilter {
	eq?: string | null;
	ne?: string | null;
	in?: string[] | null;
	notIn?: string[] | null;
	exists?: boolean | null;
}

export interface BooleanFilter {
	eq: boolean;
}

/**
 * Build MongoDB query from StringFilter
 */
export function buildStringFilter(filter?: StringFilter | null): any {
	if (!filter) return undefined;

	const { operator, value, values, caseSensitive = false } = filter;

	switch (operator) {
		case 'EQ':
			return caseSensitive
				? value
				: { $regex: new RegExp(`^${escapeRegex(value || '')}$`, 'i') };

		case 'NE':
			return caseSensitive
				? { $ne: value }
				: { $not: new RegExp(`^${escapeRegex(value || '')}$`, 'i') };

		case 'CONTAINS':
			return {
				$regex: new RegExp(escapeRegex(value || ''), caseSensitive ? '' : 'i'),
			};

		case 'STARTS_WITH':
			return {
				$regex: new RegExp(
					`^${escapeRegex(value || '')}`,
					caseSensitive ? '' : 'i',
				),
			};

		case 'ENDS_WITH':
			return {
				$regex: new RegExp(
					`${escapeRegex(value || '')}$`,
					caseSensitive ? '' : 'i',
				),
			};

		case 'REGEX':
			return { $regex: new RegExp(value || '', caseSensitive ? '' : 'i') };

		case 'IN':
			return caseSensitive
				? { $in: values || [] }
				: {
						$in: (values || []).map(
							(v) => new RegExp(`^${escapeRegex(v)}$`, 'i'),
						),
					};

		case 'NOT_IN':
			return caseSensitive
				? { $nin: values || [] }
				: {
						$not: {
							$in: (values || []).map(
								(v) => new RegExp(`^${escapeRegex(v)}$`, 'i'),
							),
						},
					};

		default:
			return undefined;
	}
}

/**
 * Build MongoDB query from NumberFilter
 */
export function buildNumberFilter(filter?: NumberFilter | null): any {
	if (!filter) return undefined;

	const { operator, value, values } = filter;

	switch (operator) {
		case 'EQ':
			return value;
		case 'NE':
			return { $ne: value };
		case 'GT':
			return { $gt: value };
		case 'GTE':
			return { $gte: value };
		case 'LT':
			return { $lt: value };
		case 'LTE':
			return { $lte: value };
		case 'IN':
			return { $in: values || [] };
		case 'NOT_IN':
			return { $nin: values || [] };
		default:
			return undefined;
	}
}

/**
 * Build MongoDB query from DateRangeFilter
 */
export function buildDateRangeFilter(filter?: DateRangeFilter | null): any {
	if (!filter) return undefined;

	const query: any = {};

	if (filter.eq) {
		return new Date(filter.eq);
	}

	if (filter.from) {
		query.$gte = new Date(filter.from);
	}

	if (filter.to) {
		query.$lte = new Date(filter.to);
	}

	if (filter.before) {
		query.$lt = new Date(filter.before);
	}

	if (filter.after) {
		query.$gt = new Date(filter.after);
	}

	return Object.keys(query).length > 0 ? query : undefined;
}

/**
 * Build MongoDB query from ArrayFilter
 */
export function buildArrayFilter(filter?: ArrayFilter | null): any {
	if (!filter) return undefined;

	const { operator, values } = filter;

	switch (operator ?? 'ANY') {
		case 'ALL':
			return { $all: values };
		case 'ANY':
			return { $in: values };
		case 'NONE':
			return { $nin: values };
		case 'EXACT':
			return values;
		default:
			return undefined;
	}
}

/**
 * Build MongoDB query from ObjectIDFilter
 */
export function buildObjectIDFilter(filter?: ObjectIDFilter | null): any {
	if (!filter) return undefined;

	if (filter.exists !== undefined) {
		return { $exists: filter.exists };
	}

	if (filter.eq) {
		return filter.eq;
	}

	if (filter.ne) {
		return { $ne: filter.ne };
	}

	if (filter.in) {
		return { $in: filter.in };
	}

	if (filter.notIn) {
		return { $nin: filter.notIn };
	}

	return undefined;
}

/**
 * Build MongoDB query from BooleanFilter
 */
export function buildBooleanFilter(filter?: BooleanFilter | null): any {
	if (!filter) return undefined;
	return filter.eq;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build MongoDB sort object from typed sort input
 * @param sort Object with field names as keys and 'ASC' or 'DESC' as values
 * @returns MongoDB sort object
 */
export function buildSort(sort?: SortObject | null): any {
	if (!sort) return undefined;

	const mongoSort: Record<string, 1 | -1> = {};

	for (const [field, direction] of Object.entries(sort)) {
		mongoSort[field] = direction === 'ASC' ? 1 : -1;
	}

	return Object.keys(mongoSort).length > 0 ? mongoSort : undefined;
}

/**
 * Shape of the `AND`/`OR`/`NOT` combinators every generated GraphQL
 * `<Entity>Filter` input carries.
 */
export type LogicalFilterInput<TFilter> = {
	AND?: TFilter[] | TFilter | null;
	OR?: TFilter[] | TFilter | null;
	NOT?: TFilter[] | TFilter | null;
};

/**
 * Build the `$and`/`$or`/`$not` part of a Mongo filter from the recursive
 * `AND`/`OR`/`NOT` combinators of a generated GraphQL filter input.
 *
 * Every module's `build<Entity>Filter` starts with the exact same block; this
 * factors it out without changing behaviour. Call it first, then add the
 * module's own leaf conditions onto the returned object:
 *
 * ```ts
 * function buildBedFilter(filter?: BedFilter | null): QueryFilter<BedDocument> {
 *   const mongoFilter = buildLogicalFilter(filter, buildBedFilter);
 *   if (!filter) return mongoFilter;
 *   addFilterCondition(mongoFilter, 'name', buildStringFilter(filter.name));
 *   return mongoFilter;
 * }
 * ```
 *
 * Note `NOT` maps to `$not`, matching the behaviour of the hand-written
 * blocks this replaces.
 */
export function buildLogicalFilter<TFilter, TDoc = any>(
	filter: TFilter | null | undefined,
	build: (filter?: TFilter | null) => QueryFilter<TDoc>,
): QueryFilter<TDoc> {
	const mongoFilter: QueryFilter<TDoc> = {};

	if (!filter) return mongoFilter;

	const logical = filter as LogicalFilterInput<TFilter>;
	const target = mongoFilter as Record<string, any>;

	(['AND', 'OR', 'NOT'] as const).forEach((logicalOp) => {
		const subFilters = logical[logicalOp];
		if (subFilters) {
			target[`$${logicalOp.toLowerCase()}`] = Array.isArray(subFilters)
				? subFilters.map((subFilter) => build(subFilter))
				: build(subFilters);
		}
	});

	return mongoFilter;
}

/**
 * Combine multiple filters with logical operator
 */
export function combineFilters(
	filters: Array<QueryFilter<any> | undefined>,
	operator: LogicalOperator = 'AND',
): QueryFilter<any> {
	const validFilters = filters.filter((f) => !!f && Object.keys(f).length > 0);

	if (validFilters.length === 0) {
		return {};
	}

	if (validFilters.length === 1) {
		return validFilters[0] ?? {};
	}

	return operator === 'AND'
		? { $and: validFilters as any }
		: { $or: validFilters as any };
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
