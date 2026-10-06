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

const schema = new mongoose.Schema({ label: String, n: Number, loc: [Number] });
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

	it('keeps a caller $match naming deleted, and prepends its own', () => {
		const pipeline = [{ $match: { deleted: false } }, { $limit: 1 }];
		expect(Item.aggregate(pipeline).pipeline()).toEqual([
			{ $match: { deleted: { $ne: true } } },
			{ $match: { deleted: false } },
			{ $limit: 1 },
		]);
		expect(Item.aggregateDeleted(pipeline).pipeline()).toEqual([
			{ $match: { deleted: { $eq: true } } },
			{ $match: { deleted: false } },
			{ $limit: 1 },
		]);
	});

	const firstStages = [
		{ $geoNear: { near: [0, 0], key: 'loc', distanceField: 'dist' } },
		{ $search: { text: { query: 'a', path: 'label' } } },
		{ $searchMeta: { count: { type: 'total' } } },
		{
			$vectorSearch: {
				index: 'v',
				path: 'embedding',
				queryVector: [0.1],
				numCandidates: 10,
				limit: 1,
			},
		},
	];
	for (const first of firstStages) {
		const name = Object.keys(first)[0];
		it(`leaves ${name} first and puts the $match right after it`, () => {
			expect(Item.aggregate([first, { $limit: 1 }]).pipeline()).toEqual([
				first,
				{ $match: { deleted: { $ne: true } } },
				{ $limit: 1 },
			]);
		});
	}

	it('folds into a $match that follows a first-only stage', () => {
		const geoNear = firstStages[0];
		expect(
			Item.aggregateDeleted([geoNear, { $match: { label: 'a' } }]).pipeline(),
		).toEqual([geoNear, { $match: { label: 'a', deleted: { $eq: true } } }]);
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
 * The same, against a server: CI starts one; locally the suite is skipped
 * unless `MONGODB_URI` names a host (see `hasMongoHost`).
 */
describe.skipIf(!hasMongoHost())('soft-delete statics (MongoDB)', () => {
	beforeAll(async () => {
		await mongoose.connect(Bun.env['MONGODB_URI'] as string);
	});

	afterAll(async () => {
		await disconnectQuietly();
	});

	beforeEach(async () => {
		await Item.collection.deleteMany({});
		await Item.collection.insertMany([
			{ label: 'a', n: 1, loc: [0, 1] },
			{ label: 'a', n: 2, loc: [0, 2], deleted: false },
			{ label: 'a', n: 4, loc: [0, 3], deleted: true },
			{ label: 'b', n: 8, loc: [0, 4] },
		]);
		await Item.collection.createIndex({ loc: '2d' });
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

	it('respects a caller $match on deleted instead of overwriting it', async () => {
		const notDeletedByFlag = [
			{ $match: { deleted: false } },
			{ $group: { _id: null, total: { $sum: '$n' } } },
		];
		expect(await Item.aggregate(notDeletedByFlag)).toEqual([
			{ _id: null, total: 2 },
		]);
		expect(await Item.aggregate([{ $match: { deleted: true } }])).toHaveLength(
			0,
		);
	});

	it('keeps $geoNear first, which the server requires', async () => {
		const nearest = await Item.aggregate([
			{ $geoNear: { near: [0, 0], key: 'loc', distanceField: 'dist' } },
			{ $project: { n: 1 } },
		]);
		expect(nearest.map((doc: any) => doc.n)).toEqual([1, 2, 8]);
		const deleted = await Item.aggregateDeleted([
			{ $geoNear: { near: [0, 0], key: 'loc', distanceField: 'dist' } },
		]);
		expect(deleted.map((doc: any) => doc.n)).toEqual([4]);
	});

	it('findDeleted returns the deleted documents only', async () => {
		const found = await Item.findDeleted({}).lean();
		expect(found.map((doc: any) => doc.n)).toEqual([4]);
		expect((await Item.findDeleted({ label: 'b' }).lean()).length).toBe(0);
	});

	it('countDocumentsDeleted counts the deleted documents only', async () => {
		expect(await Item.countDocumentsDeleted({})).toBe(1);
		expect(await Item.countDocumentsDeleted({ label: 'a' })).toBe(1);
	});
});
