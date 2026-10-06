import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'bun:test';
import mongoose from 'mongoose';
import { disconnectQuietly } from '../../migrations/disconnect';
import { hasMongoHost } from '../../test/has-mongo-host';
import { softDelete } from '../soft-delete';
import { pagination } from './index';
import { type SoftDeleteScope, softDeleteSuffix } from './soft-delete-scope';

/**
 * The paginators reach the soft-delete statics by name — `find${deleted}`,
 * `countDocuments${deleted}` — and fall back to the plain ones when the name
 * resolves to nothing. The option was typed `'Deleted' | 'WidthDeleted'`, a
 * misspelling: `findWidthDeleted` does not exist, so asking for deleted
 * documents to be included silently excluded them.
 */

const schema = new mongoose.Schema({ label: String });
schema.plugin(softDelete);
schema.plugin(pagination);
const Item = mongoose.model('PaginationSoftDeleteSpec', schema) as any;

describe('softDeleteSuffix', () => {
	it('names the statics the soft-delete plugin registers', () => {
		expect(softDeleteSuffix(undefined)).toBe('');
		expect(softDeleteSuffix('Deleted')).toBe('Deleted');
		expect(softDeleteSuffix('WithDeleted')).toBe('WithDeleted');
	});

	it('reads the deprecated WidthDeleted as WithDeleted', () => {
		expect(softDeleteSuffix('WidthDeleted')).toBe('WithDeleted');
	});

	it('resolves to statics that exist on a soft-delete model', () => {
		const scopes: SoftDeleteScope[] = [
			'Deleted',
			'WithDeleted',
			'WidthDeleted',
		];
		for (const scope of scopes) {
			const suffix = softDeleteSuffix(scope);
			expect(typeof Item[`find${suffix}`]).toBe('function');
			expect(typeof Item[`countDocuments${suffix}`]).toBe('function');
		}
	});
});

describe('aggregateWithDeleted', () => {
	it('passes the pipeline through, like aggregateWidthDeleted', () => {
		const pipeline = [{ $match: { label: 'a' } }, { $limit: 1 }];
		const aggregate = Item.aggregateWithDeleted(pipeline, {
			allowDiskUse: true,
		});
		expect(aggregate.pipeline()).toEqual(pipeline);
		expect(aggregate.options.allowDiskUse).toBe(true);
		expect(Item.aggregateWidthDeleted(pipeline).pipeline()).toEqual(pipeline);
	});
});

/**
 * Against a server: CI starts one; locally the suite is skipped unless
 * `MONGODB_URI` names a host (see `hasMongoHost`).
 */
describe.skipIf(!hasMongoHost())(
	'paginating a soft-delete model (MongoDB)',
	() => {
		beforeAll(async () => {
			await mongoose.connect(Bun.env['MONGODB_URI'] as string);
		});

		afterAll(async () => {
			await disconnectQuietly();
		});

		beforeEach(async () => {
			await Item.collection.deleteMany({});
			await Item.collection.insertMany([
				{ label: 'a' },
				{ label: 'b', deleted: false },
				{ label: 'c', deleted: true },
			]);
		});

		for (const deleted of ['WithDeleted', 'WidthDeleted'] as const) {
			it(`paginateOffset includes deleted documents with ${deleted}`, async () => {
				const page = await Item.paginateOffset({ deleted, size: 10 });
				expect(page.data).toHaveLength(3);
				expect(page.metadata.totalElements).toBe(3);
			});

			it(`paginate includes deleted documents with ${deleted}`, async () => {
				const page = await Item.paginate({ deleted, first: 10 });
				expect(page.edges).toHaveLength(3);
				expect(page.totalCount).toBe(3);
			});

			it(`cursorPaginate includes deleted documents with ${deleted}`, async () => {
				const page = await Item.cursorPaginate({ deleted, first: 10 });
				expect(page.data).toHaveLength(3);
				expect(page.metadata.totalElements).toBe(3);
			});
		}

		it('paginateOffset returns only deleted documents with Deleted', async () => {
			const page = await Item.paginateOffset({ deleted: 'Deleted', size: 10 });
			expect(page.data.map((doc: any) => doc.label)).toEqual(['c']);
			expect(page.metadata.totalElements).toBe(1);
		});

		it('paginate returns only deleted documents with Deleted', async () => {
			const page = await Item.paginate({ deleted: 'Deleted', first: 10 });
			expect(page.edges.map((edge: any) => edge.node.label)).toEqual(['c']);
			expect(page.totalCount).toBe(1);
		});

		it('cursorPaginate returns only deleted documents with Deleted', async () => {
			const page = await Item.cursorPaginate({ deleted: 'Deleted', first: 10 });
			expect(page.data.map((doc: any) => doc.label)).toEqual(['c']);
			expect(page.metadata.totalElements).toBe(1);
		});

		it('excludes deleted documents by default', async () => {
			const page = await Item.paginateOffset({ size: 10 });
			expect(page.data).toHaveLength(2);
			expect(page.metadata.totalElements).toBe(2);
		});
	},
);
