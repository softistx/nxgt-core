import { describe, expect, it } from 'bun:test';
import mongoose from 'mongoose';
import { pagination } from './index';
import { paginateListData } from './utils';

/**
 * The two repositories both put a `paginate` static on every schema and meant
 * different things by it, and neither had a test. These cover the shapes that
 * need no database: the in-memory statics and the connection builder.
 */

function model(name: string) {
	const schema = new mongoose.Schema({ label: String });
	schema.plugin(pagination);
	return mongoose.model(name, schema);
}

/** Documents shaped enough for the in-memory paths: `_id` and `id`. */
function docs(n: number) {
	return Array.from({ length: n }, (_, i) => {
		const _id = new mongoose.Types.ObjectId(
			// ascending ids, so cursor order is predictable
			(i + 1).toString(16).padStart(24, '0'),
		);
		return { _id, id: _id.toHexString(), label: `doc-${i + 1}` };
	}) as any[];
}

describe('paginateListData (cursor, Relay connection)', () => {
	it('answers edges, pageInfo and totalCount', () => {
		const result = paginateListData(docs(5), { first: 2 });
		expect(result.edges).toHaveLength(2);
		expect(result.totalCount).toBe(5);
		expect(result.pageInfo.hasNextPage).toBe(true);
		expect(result.pageInfo.startCursor).toBe(result.edges[0]?.cursor);
		expect(result.pageInfo.endCursor).toBe(result.edges[1]?.cursor);
	});

	it('reports no next page on the last slice', () => {
		expect(paginateListData(docs(2), { first: 5 }).pageInfo.hasNextPage).toBe(
			false,
		);
	});

	it('refuses first and last together', () => {
		expect(() => paginateListData(docs(3), { first: 1, last: 1 })).toThrow();
	});

	it('reads backwards when asked for the last ones', () => {
		const forward = paginateListData(docs(4), { first: 4 });
		const backward = paginateListData(docs(4), { last: 4 });
		expect(backward.edges[0]?.cursor).toBe(
			forward.edges[forward.edges.length - 1]?.cursor,
		);
	});
});

describe('paginateListOffset (page/size)', () => {
	const Offset = model('PaginationOffsetSpec');

	it('answers data and offset metadata', async () => {
		const result = await (Offset as any).paginateListOffset(docs(10), {
			page: 2,
			size: 3,
		});
		expect(result.data).toHaveLength(3);
		expect(result.data[0].label).toBe('doc-4');
		expect(result.metadata).toMatchObject({
			page: 2,
			size: 3,
			totalElements: 10,
			totalPages: 4,
			hasPreviousPage: true,
			hasNextPage: true,
		});
	});

	it('honours the requested page size', async () => {
		// sellix-monorepo computed `Math.min(Math.min(1, size ?? 20), 100)`, which
		// pins every page to one document however many are asked for. Nothing
		// called these statics, so nothing ever saw it.
		const result = await (Offset as any).paginateListOffset(docs(10), {
			page: 1,
			size: 5,
		});
		expect(result.data).toHaveLength(5);
		expect(result.metadata.size).toBe(5);
	});

	it('defaults to twenty per page, and caps at a hundred', async () => {
		const dflt = await (Offset as any).paginateListOffset(docs(50), {});
		expect(dflt.metadata.size).toBe(20);
		const capped = await (Offset as any).paginateListOffset(docs(150), {
			size: 500,
		});
		expect(capped.metadata.size).toBe(100);
	});

	it('clamps a page below one', async () => {
		const result = await (Offset as any).paginateListOffset(docs(5), {
			page: 0,
			size: 2,
		});
		expect(result.metadata.page).toBe(1);
		expect(result.metadata.hasPreviousPage).toBe(false);
	});
});

describe('the statics both repositories expect are all present', () => {
	it.each([
		'paginate',
		'paginateList',
		'paginateOffset',
		'paginateListOffset',
		'cursorPaginate',
	])('%s', (name) => {
		expect(typeof (model(`PaginationStatics_${name}`) as any)[name]).toBe(
			'function',
		);
	});
});
