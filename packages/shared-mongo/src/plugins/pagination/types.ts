import type { PopulateOptions } from 'mongoose';

/**
 * Offset pagination — page and size.
 *
 * The cursor/Relay shapes live in `../../models/pagination.ts` and own the
 * plain names (`PaginationOptions`, `NestedPaginationOptions`), because that is
 * what `Model.paginate` answers and what every consumer of it passes. These
 * carry the `Offset` prefix so both can be exported from one package; they had
 * the plain names in sellix-monorepo, where nothing called them.
 */
/**
 * The deprecated spelling of `'WithDeleted'`. It is still accepted, and the
 * paginators read it as `'WithDeleted'`; it will be removed in a major release.
 *
 * @deprecated Use `'WithDeleted'`.
 */
export type WidthDeleted = 'WidthDeleted';

/**
 * Which documents a paginator reads on a schema using the `softDelete` plugin:
 * omitted for those not deleted, `'Deleted'` for the deleted ones only,
 * `'WithDeleted'` for all of them. `'WidthDeleted'` is the deprecated spelling
 * of `'WithDeleted'` (see {@link WidthDeleted}).
 */
export type SoftDeleteScope = 'Deleted' | 'WithDeleted' | WidthDeleted;

export class OffsetPaginationOptions {
	filter?: object;
	sort?: object;
	page?: number;
	size?: number;
}

export class NestedOffsetPaginationOptions {
	page?: number;
	size?: number;
}

export interface OffsetPageInfo {
	page: number;
	size: number;
	totalPages: number;
	nbOfElements: number;
	totalElements: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
}

export interface IPaginatedType<T> {
	data: T[];
	metadata: OffsetPageInfo;
}

export type PaginateOffsetOptions = OffsetPaginationOptions & {
	deleted?: SoftDeleteScope;
} & {
	populate?: string | PopulateOptions | (string | PopulateOptions)[];
};

export class CursorPaginationOptions {
	filter?: object;
	first?: number;
	last?: number;
	after?: string;
	before?: string;
}

export interface CursorPageInfo {
	startCursor: string | null;
	endCursor: string | null;
	hasNextPage: boolean;
	totalElements: number;
}

export interface ICursorPaginatedType<T> {
	data: T[];
	metadata: CursorPageInfo;
}

export type CursorPaginateOptions = CursorPaginationOptions & {
	deleted?: SoftDeleteScope;
} & {
	populate?: string | PopulateOptions | (string | PopulateOptions)[];
};
