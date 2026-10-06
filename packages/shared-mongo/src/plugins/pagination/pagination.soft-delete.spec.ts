import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from 'bun:test';
import mongoose from 'mongoose';
import { disconnectQuietly } from '../../migrations/disconnect';
import { softDelete } from '../soft-delete';
import { pagination } from './index';
import type { SoftDeleteScope } from './types';
import { softDeleteSuffix } from './utils';

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
	it('is the consistently named aggregateWidthDeleted', () => {
		const pipeline = [{ $match: { label: 'a' } }];
		const options = { allowDiskUse: true };
		const spy = spyOn(Item, 'aggregateWidthDeleted').mockReturnValue('same');
		try {
			expect(Item.aggregateWithDeleted(pipeline, options)).toBe('same');
			expect(spy).toHaveBeenCalledWith(pipeline, options);
		} finally {
			spy.mockRestore();
		}
	});
});

/**
 * Against a server. CI starts one and sets `MONGODB_URI`; locally `.env.test`
 * expands to a URI with no host when the Mongo variables are unset, and an
 * absent database is not a failing test.
 */
function hasMongoHost(uri: string | undefined): boolean {
	if (!uri) return false;
	try {
		return new URL(uri).host !== '';
	} catch {
		return false;
	}
}

describe.skipIf(!hasMongoHost(Bun.env['MONGODB_URI']))(
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

		it('excludes deleted documents by default', async () => {
			const page = await Item.paginateOffset({ size: 10 });
			expect(page.data).toHaveLength(2);
			expect(page.metadata.totalElements).toBe(2);
		});
	},
);
