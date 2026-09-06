/**
 * Sort order, matching the OpenAPI `SortOrder` schema.
 *
 * `SortDirection` is the name sellix-monorepo gave the identical enum in
 * `@nxgt/shared-mongo`. The two packages carried the same twenty lines under
 * two names; this is the one copy, and `@nxgt/shared-mongo` re-exports it so
 * neither repository's imports change.
 */
export enum SortOrder {
	ASC = 'asc',
	DESC = 'desc',
}

/** sellix-monorepo's name for {@link SortOrder}. */
export const SortDirection = SortOrder;
export type SortDirection = SortOrder;

/** A sort field, matching the OpenAPI `SortField` schema. */
export interface SortField {
	key: string;
	order: SortOrder | 'asc' | 'desc';
}

/** Build a MongoDB sort object from a list of sort fields. */
export function buildSort(
	sortFields:
		| SortField[]
		| { key: string; order: 'asc' | 'desc' }[]
		| undefined,
) {
	if (!sortFields || sortFields.length === 0) {
		return undefined;
	}

	const sort: Record<string, 1 | -1> = {};
	for (const field of sortFields) {
		sort[field.key] = field.order === 'asc' ? 1 : -1;
	}
	return sort;
}
