import { CustomException } from '@nxgt/shared-exceptions';
import type { QueryFilter, Schema } from 'mongoose';
import type {
	CursorPaginateOptions,
	NestedPaginationOptions,
	PaginateOptions,
} from './types';

export function applyPagination(schema: Schema) {
	schema.static('paginate', async function () {
		const options = <PaginateOptions>arguments?.[0] ?? {};
		const filter = options.filter ?? {},
			sort = options.sort ?? {};

		const populate = options.populate ?? [];

		const deleted = options.deleted ?? '';

		const count = await ((this as any)[`countDocuments${deleted}`]?.(filter) ??
			this.countDocuments(filter));

		const paginated = (options.page ?? 0) > 0 || (options.size ?? 0) > 0;
		const size = !paginated
			? count
			: (options.size ?? 0) > 0
				? options.size
				: 20;
		const page = (options.page ?? 0) > 0 && paginated ? (options.page ?? 0) : 1;

		const totalPages = Math.floor((count - 1) / size) + 1;
		const hasPreviousPage = page > 1;
		const hasNextPage = page < totalPages;

		if (!paginated) {
			const docs = await (
				(this as any)[`find${deleted}`]?.(
					filter,
					arguments?.[1],
					arguments?.[2],
				) ?? this.find(filter, arguments?.[1], arguments?.[2])
			)
				.populate(populate)
				.sort(sort)
				.exec();

			return {
				data: docs,
				metadata: {
					page,
					size,
					totalElements: count,
					totalPages,
					nbOfElements: docs.length,
					hasPreviousPage,
					hasNextPage,
				},
			};
		}

		const skip = (page - 1) * size;

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
				hasPreviousPage,
				hasNextPage,
			},
		};
	});

	schema.static('paginateList', async function () {
		const docs = arguments?.[0] ?? [];
		const options = <NestedPaginationOptions>arguments?.[1] ?? {};
		const count = docs.length;

		const paginated = (options.page ?? 0) > 0 || (options.size ?? 0) > 0;
		const size = !paginated
			? count
			: (options.size ?? 0) > 0
				? options.size
				: 20;
		const page = (options.page ?? 0) > 0 && paginated ? (options.page ?? 0) : 1;

		const totalPages = Math.floor((count - 1) / size) + 1;
		const hasPreviousPage = page > 1;
		const hasNextPage = page < totalPages;

		const skip = (page - 1) * size;

		return {
			data: docs.slice(skip, skip + size),
			metadata: {
				page,
				size,
				totalElements: count,
				totalPages,
				nbOfElements: docs.length,
				hasPreviousPage,
				hasNextPage,
			},
		};
	});

	schema.static('cursorPaginate', async function () {
		const options = <CursorPaginateOptions>arguments?.[0] ?? {};
		const filter = options.filter ?? {};
		const populate = options.populate ?? [];
		const deleted = options.deleted ?? '';
		const baseSort = options.sort ?? {};

		const after = options.after;
		const before = options.before;

		// Validate first and last
		const first =
			options.first && options.first > 0 ? options.first : undefined;
		const last = options.last && options.last > 0 ? options.last : undefined;

		if (first && last) {
			throw CustomException.badRequest({
				message: 'errors.could-not-use-first-and-last-together',
			});
		}

		// Build cursor filter
		const cursorFilter: QueryFilter<any> = { ...filter };

		if (after) {
			cursorFilter._id = { $gt: after };
		}

		if (before) {
			cursorFilter._id = { $lt: before };
		}

		// Determine limit and sort order
		const hasLimit = first || last;
		const limit = hasLimit ? ((first ?? last) as number) : undefined;
		const querySort = last ? { ...baseSort, _id: -1 } : { ...baseSort, _id: 1 };

		// Build query
		const query = (
			(this as any)[`find${deleted}`]?.(
				cursorFilter,
				arguments?.[1],
				arguments?.[2],
			) ?? this.find(cursorFilter, arguments?.[1], arguments?.[2])
		)
			.populate(populate)
			.sort(querySort);

		// Apply limit only if specified (fetch one extra to determine if there are more pages)
		if (hasLimit) {
			query.limit(Math.max(limit ?? 0, 1) + 1);
		}

		const docs = await query.exec();

		// If using 'last', reverse the results back to normal order
		const hasExtraDoc = !!hasLimit && docs.length > (limit as number);
		const resultDocs = hasExtraDoc ? docs.slice(0, limit) : docs;
		if (last) {
			resultDocs.reverse();
		}

		// Get total count
		const totalElements = await ((this as any)[`countDocuments${deleted}`]?.(
			filter,
		) ?? this.countDocuments(filter));

		// Determine cursors and page info
		const startCursor =
			resultDocs.length > 0 ? resultDocs[0]._id.toString() : null;
		const endCursor =
			resultDocs.length > 0
				? resultDocs[resultDocs.length - 1]._id.toString()
				: null;

		let hasNextPage = false;
		let hasPreviousPage = false;

		if (first) {
			hasNextPage = hasExtraDoc;
			hasPreviousPage = !!after;
		} else if (last) {
			hasNextPage = !!before;
			hasPreviousPage = hasExtraDoc;
		}

		return {
			data: resultDocs,
			metadata: {
				startCursor,
				endCursor,
				hasNextPage,
				hasPreviousPage,
				totalElements,
			},
		};
	});
}
