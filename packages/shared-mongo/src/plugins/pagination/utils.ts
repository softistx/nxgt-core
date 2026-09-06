import { CustomException } from '@nxgt/shared-exceptions';
import type { Document, HydratedDocument, QueryFilter, Schema } from 'mongoose';
import type {
	IConnection,
	IPageInfo,
	NestedPaginationOptions,
	PaginationOptions,
} from '../../models/pagination';
import type {
	CursorPaginateOptions,
	NestedOffsetPaginationOptions,
	PaginateOffsetOptions,
} from './types';

const MAX_SIZE = 100;

/**
 * Both repositories put a `paginate` static on every schema, and they meant
 * different things by it: sellix-monorepo answered `{data, metadata}` from a
 * page and a size, nxgt-federation answered a Relay `{edges, pageInfo,
 * totalCount}` from a cursor.
 *
 * `paginate` keeps federation's meaning because federation calls it from
 * dozens of services and sellix-monorepo called it from none — its offset
 * variants were dead code there. They survive under explicit names rather than
 * being deleted, since a cursor connection cannot express "page 7 of 12".
 *
 *   paginate            cursor, Relay connection
 *   paginateList        cursor, over a list already in memory
 *   paginateOffset      page/size, {data, metadata}
 *   paginateListOffset  page/size, over a list already in memory
 *   cursorPaginate      cursor, {data, metadata} — sellix's third shape
 */
export function applyPagination(schema: Schema) {
	schema.static('paginate', async function () {
		const options =
			<PaginationOptions & { deleted?: 'Deleted' | 'WithDeleted' }>(
				arguments?.[0]
			) ?? {};

		const { first, last, before, after, extraFilter } = options;

		let filter = options.filter ?? {};
		const deleted = options.deleted ?? '';

		const countDocuments = (f: any) =>
			this[`countDocuments${deleted}`]?.(f) ?? this.countDocuments(f);

		if (extraFilter) {
			filter = filter ? { $and: [filter, extraFilter] } : extraFilter;
		}

		if (first && last) {
			throw CustomException.badRequest({
				message: 'errors.could-not-use-first-and-last-together',
			});
		}

		if (after) {
			filter = filter
				? { $and: [filter, { _id: { $gt: after } }] }
				: { _id: { $gt: after } };
		}

		if (before) {
			filter = filter
				? { $and: [filter, { _id: { $lt: before } }] }
				: { _id: { $lt: before } };
		}

		const limit = Math.min(first ?? last ?? MAX_SIZE, MAX_SIZE);
		// Backward pagination reads in reverse.
		const sort = { _id: last || before ? -1 : 1 };

		let query = (
			(this[`find${deleted}`] as any)?.(
				filter,
				arguments?.[1],
				arguments?.[2],
			) ?? this.find(filter, arguments?.[1], arguments?.[2])
		).sort(sort);

		// One more than asked for, to know whether another page exists.
		query = query.limit(limit + 1);

		const result = await query.exec();
		const hasExtraDoc = result.length > limit;
		const actualResults = hasExtraDoc ? result.slice(0, limit) : result;

		const total = await countDocuments(filter);

		const edges = actualResults.map((item: any) => ({
			node: item,
			cursor: item.id,
		}));

		const pageInfo: IPageInfo = {
			hasNextPage: hasExtraDoc,
			startCursor: edges?.[0]?.cursor,
			endCursor: edges?.[edges.length - 1]?.cursor,
		};

		return { edges, pageInfo, totalCount: total };
	});

	schema.static('paginateList', function () {
		const docs = (arguments?.[0] ?? []) as HydratedDocument<any>[];
		const options = <NestedPaginationOptions>arguments?.[1] ?? {};
		return paginateListData(docs, options);
	});

	schema.static('paginateOffset', async function () {
		const options = <PaginateOffsetOptions>arguments?.[0] ?? {};
		const filter = options.filter ?? {};
		const sort = options.sort ?? {};
		const populate = options.populate ?? [];
		const deleted = options.deleted ?? '';

		const count = await ((this as any)[`countDocuments${deleted}`]?.(filter) ??
			this.countDocuments(filter));

		const { size, page, totalPages, skip } = offsetWindow(options, count);

		const docs = await (
			(this as any)[`find${deleted}`]?.(
				filter,
				arguments?.[1],
				arguments?.[2],
			) ?? this.find(filter, arguments?.[1], arguments?.[2])
		)
			.populate(populate)
			.sort(sort)
			.skip(skip)
			.limit(size)
			.exec();

		return {
			data: docs,
			metadata: {
				page,
				size,
				totalElements: count,
				totalPages,
				nbOfElements: docs.length,
				hasPreviousPage: page > 1,
				hasNextPage: page < totalPages,
			},
		};
	});

	schema.static('paginateListOffset', async function () {
		const docs = arguments?.[0] ?? [];
		const options = <NestedOffsetPaginationOptions>arguments?.[1] ?? {};
		const count = docs.length;

		const { size, page, totalPages, skip } = offsetWindow(options, count);

		return {
			data: docs.slice(skip, skip + size),
			metadata: {
				page,
				size,
				totalElements: count,
				totalPages,
				nbOfElements: docs.length,
				hasPreviousPage: page > 1,
				hasNextPage: page < totalPages,
			},
		};
	});

	schema.static('cursorPaginate', async function () {
		const options = <CursorPaginateOptions>arguments?.[0] ?? {};
		const filter = options.filter ?? {};
		const populate = options.populate ?? [];
		const deleted = options.deleted ?? '';

		const { after, before } = options;
		const first =
			options.first && options.first > 0 ? options.first : undefined;
		const last = options.last && options.last > 0 ? options.last : undefined;

		if (first && last) {
			throw CustomException.badRequest({
				message: 'errors.could-not-use-first-and-last-together',
			});
		}

		const cursorFilter: QueryFilter<any> = filter;
		if (after) cursorFilter._id = { $gt: after };
		if (before) cursorFilter._id = { $lt: before };

		const limit = Math.min(first ?? last ?? MAX_SIZE, MAX_SIZE);
		const querySort = { _id: last || before ? -1 : 1 };

		const query = (
			(this as any)[`find${deleted}`]?.(
				cursorFilter,
				arguments?.[1],
				arguments?.[2],
			) ?? this.find(cursorFilter, arguments?.[1], arguments?.[2])
		)
			.populate(populate)
			.sort(querySort);

		query.limit(Math.max(limit ?? 0, 1) + 1);

		const docs = await query.exec();

		const hasExtraDoc = docs.length > limit;
		const resultDocs = hasExtraDoc ? docs.slice(0, limit) : docs;
		if (last) {
			resultDocs.reverse();
		}

		const totalElements = await ((this as any)[`countDocuments${deleted}`]?.(
			filter,
		) ?? this.countDocuments(filter));

		return {
			data: resultDocs,
			metadata: {
				startCursor:
					resultDocs.length > 0 ? resultDocs[0]._id.toString() : null,
				endCursor:
					resultDocs.length > 0
						? resultDocs[resultDocs.length - 1]._id.toString()
						: null,
				hasNextPage: hasExtraDoc,
				totalElements,
			},
		};
	});
}

/**
 * The page window, shared by both offset statics.
 *
 * sellix-monorepo computed the size as `Math.min(Math.min(1, size ?? 20), 100)`,
 * whose inner `Math.min(1, …)` pins every page to a single document whatever
 * the caller asks for. Nothing called these statics, so nothing ever saw it.
 */
function offsetWindow(
	options: { page?: number; size?: number },
	count: number,
) {
	const size = Math.min(Math.max(options.size ?? 20, 1), MAX_SIZE);
	const page = Math.max(options.page ?? 1, 1);
	return {
		size,
		page,
		totalPages: Math.floor((count - 1) / size) + 1,
		skip: (page - 1) * size,
	};
}

export function paginateListData<T extends HydratedDocument<{ id: string }>>(
	list: T[],
	options: PaginationOptions,
): IConnection<T> {
	const { first, last, before, after } = options;

	if (first && last) {
		throw CustomException.badRequest({
			message: 'errors.could-not-use-first-and-last-together',
		});
	}

	const isBackward = last || before;

	const sortedData = (list as Document[]).sort((a, b) => {
		if (a._id.toString() < b._id.toString()) return isBackward ? 1 : -1;
		if (a._id.toString() > b._id.toString()) return isBackward ? -1 : 1;
		return 0;
	});

	const total = sortedData.length;

	let filteredData = sortedData;
	if (after || before) {
		const index = sortedData.findIndex(
			(item) => (item as any).id === (after ?? before),
		);
		filteredData = index !== -1 ? sortedData.slice(index + 1) : sortedData;
	}

	const limit = Math.min(first ?? last ?? MAX_SIZE, MAX_SIZE);

	const hasExtraDoc = filteredData.length > limit;
	const resultData = filteredData.slice(0, limit);

	const edges = resultData.map((item) => ({
		node: item,
		cursor: (item as any).id,
	}));

	const pageInfo: IPageInfo = {
		hasNextPage: hasExtraDoc,
		startCursor: edges?.[0]?.cursor,
		endCursor: edges?.[edges.length - 1]?.cursor,
	};

	return { edges, pageInfo, totalCount: total } as IConnection<T>;
}
