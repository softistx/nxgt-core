export interface SimplePaginationOptions {
	limit?: number | null;
	skip?: number | null;
	filter?: object | null;
}

export interface PaginationOptions {
	first?: number | null;
	last?: number | null;
	before?: string | null;
	after?: string | null;
	filter?: object | null;
	extraFilter?: any | null;
}

export interface NestedPaginationOptions {
	first?: number | null;
	last?: number | null;
	before?: string | null;
	after?: string | null;
}

export interface IPageInfo {
	startCursor?: string | null;
	endCursor?: string | null;
	hasNextPage: boolean;
}

export interface IEdge<T> {
	node: T;
	cursor: string;
}

export interface IConnection<T> {
	edges: IEdge<T>[];
	pageInfo: IPageInfo;
	totalCount: number;
}
