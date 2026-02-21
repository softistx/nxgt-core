/**
 * Sort order enum matching OpenAPI SortOrder schema
 */
export enum SortOrder {
	ASC = 'asc',
	DESC = 'desc',
}

/**
 * Sort field type matching OpenAPI SortField schema
 */
export interface SortField {
	key: string;
	order: SortOrder | 'asc' | 'desc';
}

/**
 * Helper to build MongoDB sort object from array of SortField
 * @param sortFields - Array of sort fields with key and order
 * @returns MongoDB sort object
 */
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
		// Convert 'asc' to 1 and 'desc' to -1 for MongoDB
		sort[field.key] = field.order === 'asc' ? 1 : -1;
	}

	return sort;
}
