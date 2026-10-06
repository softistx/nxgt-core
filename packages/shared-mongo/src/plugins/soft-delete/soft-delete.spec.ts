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
import { softDelete } from './index';

/**
 * The `aggregate` overrides used to push the caller's arguments onto the model
 * (`Array.prototype.push.apply(this, arguments)`) instead of onto their own
 * argument list. A model is a function whose `length` is read-only, so every
 * `Model.aggregate()` on a soft-delete schema threw a TypeError before reaching
 * the server — and had the push succeeded, the caller's pipeline would still
 * have been dropped, since the code read its arguments as one stage each, the
 * shape mongoose 4 accepted.
 *
 * Building an aggregate needs no database: `Model.aggregate()` returns an
 * `Aggregate` whose `pipeline()` is exactly what would be sent.
 */

const schema = new mongoose.Schema({ label: String, n: Number });
schema.plugin(softDelete);
const Item = mongoose.model('SoftDeleteAggregateSpec', schema) as any;

describe('aggregate on a soft-delete schema (no database)', () => {
	it('keeps the caller pipeline and prepends the not-deleted $match', () => {
		const pipeline = [{ $group: { _id: '$label', total: { $sum: '$n' } } }];
		expect(Item.aggregate(pipeline).pipeline()).toEqual([
			{ $match: { deleted: { $ne: true } } },
			{ $group: { _id: '$label', total: { $sum: '$n' } } },
		]);
	});

	it('merges into a leading $match without mutating the caller stage', () => {
		const pipeline = [{ $match: { label: 'a' } }, { $sort: { n: 1 } }];
		expect(Item.aggregate(pipeline).pipeline()).toEqual([
			{ $match: { label: 'a', deleted: { $ne: true } } },
			{ $sort: { n: 1 } },
		]);
		expect(pipeline[0]).toEqual({ $match: { label: 'a' } });
	});

	it('answers only the $match when called without a pipeline', () => {
		expect(Item.aggregate().pipeline()).toEqual([
			{ $match: { deleted: { $ne: true } } },
		]);
	});

	it('passes the options through', () => {
		const aggregate = Item.aggregate([{ $sort: { n: 1 } }], {
			allowDiskUse: true,
		});
		expect(aggregate.options.allowDiskUse).toBe(true);
	});

	it('aggregateDeleted keeps the pipeline and selects deleted documents', () => {
		expect(
			Item.aggregateDeleted([
				{ $match: { label: 'a' } },
				{ $limit: 1 },
			]).pipeline(),
		).toEqual([
			{ $match: { label: 'a', deleted: { $eq: true } } },
			{ $limit: 1 },
		]);
	});

	it('aggregateWidthDeleted passes the pipeline through untouched', () => {
		const pipeline = [{ $match: { label: 'a' } }, { $limit: 1 }];
		expect(Item.aggregateWidthDeleted(pipeline).pipeline()).toEqual([
			{ $match: { label: 'a' } },
			{ $limit: 1 },
		]);
	});
});

/**
 * The same, against a server. CI starts one and sets `MONGODB_URI`; locally
 * `.env.test` expands to a URI with no host when the Mongo variables are unset,
 * and an absent database is not a failing test.
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
	'aggregate on a soft-delete schema (MongoDB)',
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
				{ label: 'a', n: 1 },
				{ label: 'a', n: 2, deleted: false },
				{ label: 'a', n: 4, deleted: true },
				{ label: 'b', n: 8 },
			]);
		});

		const sumOfA = [
			{ $match: { label: 'a' } },
			{ $group: { _id: null, total: { $sum: '$n' } } },
		];

		it('runs the caller pipeline over documents not deleted', async () => {
			expect(await Item.aggregate(sumOfA)).toEqual([{ _id: null, total: 3 }]);
		});

		it('aggregateDeleted runs it over deleted documents only', async () => {
			expect(await Item.aggregateDeleted(sumOfA)).toEqual([
				{ _id: null, total: 4 },
			]);
		});

		it('aggregateWidthDeleted runs it over every document', async () => {
			expect(await Item.aggregateWidthDeleted(sumOfA)).toEqual([
				{ _id: null, total: 7 },
			]);
		});
	},
);
