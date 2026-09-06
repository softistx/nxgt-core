import type { PopulateOptions } from 'mongoose';

export class PaginationOptions {
	filter?: object;
	sort?: object;
	page?: number;
	size?: number;
}

export class NestedPaginationOptions {
	page?: number;
	size?: number;
}

export interface PageInfo {
	page: number;
	size: number;
	totalPages: number;
	nbOfElements: number;
	totalElements: number;
	hasNextPage: boolean;
}

export interface IPaginatedType<T> {
	data: T[];
	metadata: PageInfo;
}

export type PaginateOptions = PaginationOptions & {
	deleted?: 'Deleted' | 'WidthDeleted';
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
	deleted?: 'Deleted' | 'WidthDeleted';
} & {
	populate?: string | PopulateOptions | (string | PopulateOptions)[];
};
