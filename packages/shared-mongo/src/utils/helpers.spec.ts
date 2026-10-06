import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'bun:test';
import { CustomException } from '@nxgt/shared-exceptions';
import mongoose from 'mongoose';
import { disconnectQuietly } from '../migrations/disconnect';
import { hasMongoHost } from '../test/has-mongo-host';
import {
	buildListStringPatch,
	buildListStringPatchUpdate,
	checkVersion,
	patchListObjectId,
	patchListString,
	resolveListStringPatch,
} from './helpers';

/**
 * The list-patch helpers turn a `ListStringPatch` (`replace` / `add` /
 * `remove`) into either a resulting list or a MongoDB update document.
 * Consumers call them on access lists, so a wrong shape here is a wrong set of
 * people allowed in.
 *
 * The first half needs no database: the async helpers only ever call
 * `model.find({ _id, ...filter }).exec()`, so a stand-in model that answers
 * from a known set of ids pins exactly what they send and what they build.
 * The second half applies each produced update to a real document.
 */

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const C = '64b000000000000000000003';
const UNKNOWN = '64b0000000000000000000ff';

/** A model whose `find` answers the ids it knows, and records each query. */
function fakeModel(known: string[]) {
	const queries: Record<string, unknown>[] = [];
	const model = {
		find(query: { _id: string[] } & Record<string, unknown>) {
			queries.push(query);
			return {
				exec: async () =>
					query._id.filter((id) => known.includes(id)).map((_id) => ({ _id })),
			};
		},
	};
	return { model: model as any, queries };
}

/**
 * Two of `replace`, `add` and `remove` on one path cannot share an update: the
 * builders would name the path under two operators (a bare `replace` becomes
 * a `$set`), and MongoDB answers code 40, "Updating the path 'tags' would
 * create a conflict at 'tags'". The operator builders refuse the combination
 * as a bad request instead.
 */
async function expectOneOperationPerPath(
	update: Promise<unknown>,
	path: string,
) {
	let thrown: unknown;
	try {
		await update;
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBeInstanceOf(CustomException);
	expect(thrown).toMatchObject({
		code: 400,
		errorCode: 'BAD_REQUEST',
		message: 'errors.list-patch-one-operation-per-path',
		options: { path },
	});
}

/** Every combination that would name one path under two operators. */
const CONFLICTING = [
	{ add: [A], remove: [B] },
	{ replace: [A], add: [B] },
	{ replace: [A], remove: [B] },
	{ replace: [A], add: [B], remove: [C] },
];

describe('patchListString', () => {
	it('returns the list itself when there is no patch', () => {
		const list = [A, B];
		expect(patchListString(list)).toBe(list);
		expect(patchListString(list, null)).toBe(list);
	});

	it('defaults to an empty list', () => {
		expect(patchListString(undefined, { add: [A] })).toEqual([A]);
	});

	it('set: replace overrides the list wholesale, and wins over add and remove', () => {
		expect(patchListString([A, B], { replace: [C] })).toEqual([C]);
		expect(
			patchListString([A, B], { replace: [C], add: [A], remove: [C] }),
		).toEqual([C]);
	});

	it('add: appends and dedupes', () => {
		expect(patchListString([A], { add: [B, A, B] })).toEqual([A, B]);
	});

	it('remove: drops every occurrence', () => {
		expect(patchListString([A, B, A], { remove: [A] })).toEqual([B]);
	});

	it('add and remove of the same value: remove wins', () => {
		expect(patchListString([A], { add: [B], remove: [B] })).toEqual([A]);
	});

	it('empty: an empty or null-valued patch leaves the list, deduped', () => {
		expect(patchListString([A, B, A], {})).toEqual([A, B]);
		expect(
			patchListString([A], { add: null, remove: null, replace: null }),
		).toEqual([A]);
		expect(patchListString([A], { replace: [] })).toEqual([A]);
	});

	it('is purely syntactic: an id nobody checked survives', () => {
		expect(patchListString([], { add: ['not-an-id'] })).toEqual(['not-an-id']);
	});
});

describe('patchListObjectId', () => {
	const oid = (id: string) => new mongoose.Types.ObjectId(id);
	const hex = (ids: mongoose.Types.ObjectId[]) =>
		ids.map((id) => id.toHexString());

	it('returns ObjectIds', () => {
		const result = patchListObjectId([oid(A)], { add: [B] });
		expect(result.every((id) => id instanceof mongoose.Types.ObjectId)).toBe(
			true,
		);
		expect(hex(result)).toEqual([A, B]);
	});

	it('reads populated documents through their _id', () => {
		expect(
			hex(patchListObjectId([{ _id: oid(A) } as any], { add: [B] })),
		).toEqual([A, B]);
	});

	it('set, add, remove and empty behave as patchListString', () => {
		expect(hex(patchListObjectId([oid(A)], { replace: [C] }))).toEqual([C]);
		expect(hex(patchListObjectId([oid(A)], { remove: [A] }))).toEqual([]);
		expect(hex(patchListObjectId([oid(A)], {}))).toEqual([A]);
		expect(hex(patchListObjectId([oid(A)]))).toEqual([A]);
		expect(hex(patchListObjectId(undefined, { add: [A] }))).toEqual([A]);
	});

	it('drops a value that is not an ObjectId', () => {
		expect(hex(patchListObjectId([oid(A)], { add: ['not-an-id'] }))).toEqual([
			A,
		]);
	});
});

describe('resolveListStringPatch (stand-in model)', () => {
	it('empty: answers undefined without querying', async () => {
		const { model, queries } = fakeModel([A]);
		for (const patch of [
			undefined,
			{},
			{ add: [], remove: [], replace: [] },
			{ add: null, remove: null, replace: null },
		]) {
			expect(await resolveListStringPatch([A], model, patch)).toBeUndefined();
		}
		expect(queries).toEqual([]);
	});

	it('set: answers the known replacement ids, ignoring what is held', async () => {
		const { model, queries } = fakeModel([B, C]);
		expect(
			await resolveListStringPatch([A], model, {
				replace: [B, UNKNOWN],
				add: [C],
			}),
		).toEqual([B]);
		expect(queries).toEqual([{ _id: [B, UNKNOWN] }]);
	});

	it('add: keeps what is held and appends the known ids, deduped', async () => {
		const { model } = fakeModel([A, B]);
		expect(
			await resolveListStringPatch([A], model, { add: [A, B, UNKNOWN] }),
		).toEqual([A, B]);
	});

	it('remove: drops without querying', async () => {
		const { model, queries } = fakeModel([]);
		expect(
			await resolveListStringPatch([A, B], model, { remove: [A] }),
		).toEqual([B]);
		expect(queries).toEqual([]);
	});

	it('add and remove together resolve to one list', async () => {
		const { model } = fakeModel([C]);
		expect(
			await resolveListStringPatch([A, B], model, { add: [C], remove: [A] }),
		).toEqual([B, C]);
	});

	it('reads populated documents, ObjectIds and raw ids alike', async () => {
		const { model } = fakeModel([]);
		const held = [
			{ _id: new mongoose.Types.ObjectId(A) },
			new mongoose.Types.ObjectId(B),
			C,
		];
		expect(await resolveListStringPatch(held, model, { remove: [B] })).toEqual([
			A,
			C,
		]);
	});

	it('treats a current value that is not an array as empty', async () => {
		const { model } = fakeModel([A]);
		expect(await resolveListStringPatch(null, model, { add: [A] })).toEqual([
			A,
		]);
	});

	it('passes the filter into the existence query', async () => {
		const { model, queries } = fakeModel([A]);
		await resolveListStringPatch([], model, { add: [A] }, { active: true });
		expect(queries).toEqual([{ _id: [A], active: true }]);
	});
});

describe('buildListStringPatch (stand-in model)', () => {
	const source = {} as any;

	it('set: assigns the path to the known ids', async () => {
		const { model } = fakeModel([A]);
		expect(
			await buildListStringPatch(source, 'tags', model, {
				replace: [A, UNKNOWN],
			}),
		).toEqual({ tags: [A] });
	});

	it('add: $addToSet with $each of the known ids', async () => {
		const { model } = fakeModel([A]);
		expect(
			await buildListStringPatch(source, 'tags', model, { add: [A, UNKNOWN] }),
		).toEqual({ $addToSet: { tags: { $each: [A] } } });
	});

	it('remove: $pullAll of the known ids', async () => {
		const { model } = fakeModel([A]);
		expect(
			await buildListStringPatch(source, 'tags', model, {
				remove: [A, UNKNOWN],
			}),
		).toEqual({ $pullAll: { tags: [A] } });
	});

	it('empty: an empty update, with no query', async () => {
		const { model, queries } = fakeModel([A]);
		expect(await buildListStringPatch(source, 'tags', model)).toEqual({});
		expect(
			await buildListStringPatch(source, 'tags', model, {
				add: [],
				remove: null,
			}),
		).toEqual({});
		expect(queries).toEqual([]);
	});

	it('an add whose ids are all unknown still emits an empty $each', async () => {
		const { model } = fakeModel([]);
		expect(
			await buildListStringPatch(source, 'tags', model, { add: [UNKNOWN] }),
		).toEqual({ $addToSet: { tags: { $each: [] } } });
	});

	for (const patch of CONFLICTING) {
		const name = Object.keys(patch).join(' and ');
		it(`${name} together: refused before any query`, async () => {
			const { model, queries } = fakeModel([A, B, C]);
			await expectOneOperationPerPath(
				buildListStringPatch(source, 'tags', model, patch),
				'tags',
			);
			expect(queries).toEqual([]);
		});
	}

	it('add and remove together: refused even when every id is unknown', async () => {
		const { model } = fakeModel([]);
		await expectOneOperationPerPath(
			buildListStringPatch(source, 'tags', model, {
				add: [UNKNOWN],
				remove: [UNKNOWN],
			}),
			'tags',
		);
	});

	it('an empty array emits nothing, so it does not count', async () => {
		const { model } = fakeModel([A, B]);
		expect(
			await buildListStringPatch(source, 'tags', model, {
				replace: [],
				add: [A],
				remove: null,
			}),
		).toEqual({ $addToSet: { tags: { $each: [A] } } });
		expect(
			await buildListStringPatch(source, 'tags', model, {
				replace: [B],
				add: [],
				remove: [],
			}),
		).toEqual({ tags: [B] });
	});

	it('passes the filter into each existence query', async () => {
		const { model, queries } = fakeModel([A]);
		await buildListStringPatch(
			source,
			'tags',
			model,
			{ add: [A] },
			{
				active: true,
			},
		);
		expect(queries).toEqual([{ _id: [A], active: true }]);
	});
});

describe('buildListStringPatchUpdate', () => {
	it('set: assigns the path as given', async () => {
		expect(await buildListStringPatchUpdate('tags', { replace: [A] })).toEqual({
			tags: [A],
		});
	});

	it('add: $addToSet with $each', async () => {
		expect(await buildListStringPatchUpdate('tags', { add: [A, B] })).toEqual({
			$addToSet: { tags: { $each: [A, B] } },
		});
	});

	it('remove: $pullAll', async () => {
		expect(await buildListStringPatchUpdate('tags', { remove: [A] })).toEqual({
			$pullAll: { tags: [A] },
		});
	});

	it('empty: an empty update', async () => {
		expect(await buildListStringPatchUpdate('tags')).toEqual({});
		expect(
			await buildListStringPatchUpdate('tags', { add: null, replace: [] }),
		).toEqual({});
	});

	for (const patch of CONFLICTING) {
		const name = Object.keys(patch).join(' and ');
		it(`${name} together: refused`, async () => {
			await expectOneOperationPerPath(
				buildListStringPatchUpdate('tags', patch),
				'tags',
			);
		});
	}

	it('an empty array emits nothing, so it does not count', async () => {
		expect(
			await buildListStringPatchUpdate('tags', { replace: [], remove: [A] }),
		).toEqual({ $pullAll: { tags: [A] } });
		expect(
			await buildListStringPatchUpdate('tags', { replace: [A], add: [] }),
		).toEqual({ tags: [A] });
	});
});

describe('checkVersion', () => {
	it('accepts a missing or matching version', () => {
		expect(() => checkVersion(3)).not.toThrow();
		expect(() => checkVersion(3, null as any)).not.toThrow();
		expect(() => checkVersion(3, 3)).not.toThrow();
	});

	it('refuses a stale version as a bad request', () => {
		let thrown: unknown;
		try {
			checkVersion(3, 2);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(CustomException);
		expect(thrown).toMatchObject({
			code: 400,
			errorCode: 'BAD_REQUEST',
			message: 'errors.optimistic-lock-failed',
		});
	});
});

/**
 * The same helpers, applied to real documents: CI starts a replica set;
 * locally the suite is skipped unless `MONGODB_URI` names a host.
 */
describe.skipIf(!hasMongoHost())('list-patch helpers (MongoDB)', () => {
	const Tag = mongoose.model(
		'ListPatchSpecTag',
		new mongoose.Schema({ name: String, active: Boolean }),
	);
	const Owner = mongoose.model(
		'ListPatchSpecOwner',
		new mongoose.Schema({
			tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ListPatchSpecTag' }],
			names: [String],
		}),
	) as mongoose.Model<any>;

	let a: string;
	let b: string;
	let inactive: string;
	let ownerId: mongoose.Types.ObjectId;

	const tagsOf = async () =>
		((await Owner.findById(ownerId).lean().exec()) as any).tags.map(String);
	const namesOf = async () =>
		((await Owner.findById(ownerId).lean().exec()) as any).names;
	const apply = (update: object) =>
		Owner.findOneAndUpdate({ _id: ownerId }, update).exec();

	beforeAll(async () => {
		await mongoose.connect(Bun.env['MONGODB_URI'] as string);
	});

	afterAll(async () => {
		await Tag.collection.drop().catch(() => {});
		await Owner.collection.drop().catch(() => {});
		await disconnectQuietly();
	});

	beforeEach(async () => {
		await Tag.deleteMany({});
		await Owner.deleteMany({});
		const [ta, tb, ti] = await Tag.create([
			{ name: 'a', active: true },
			{ name: 'b', active: true },
			{ name: 'i', active: false },
		]);
		a = String(ta?._id);
		b = String(tb?._id);
		inactive = String(ti?._id);
		const owner = await Owner.create({ tags: [a], names: ['x'] });
		ownerId = owner._id;
	});

	describe('buildListStringPatch through findOneAndUpdate', () => {
		it('set', async () => {
			await apply(
				await buildListStringPatch(Owner, 'tags', Tag, {
					replace: [b, UNKNOWN],
				}),
			);
			expect(await tagsOf()).toEqual([b]);
		});

		it('add, dropping an unknown id and one the filter excludes', async () => {
			await apply(
				await buildListStringPatch(
					Owner,
					'tags',
					Tag,
					{ add: [a, b, UNKNOWN, inactive] },
					{ active: true },
				),
			);
			expect(await tagsOf()).toEqual([a, b]);
		});

		it('remove', async () => {
			await apply(
				await buildListStringPatch(Owner, 'tags', Tag, { remove: [a] }),
			);
			expect(await tagsOf()).toEqual([]);
		});

		it('empty changes nothing', async () => {
			await apply(await buildListStringPatch(Owner, 'tags', Tag, {}));
			expect(await tagsOf()).toEqual([a]);
		});

		for (const [name, patch] of [
			['add and remove', () => ({ add: [b], remove: [a] })],
			['replace and add', () => ({ replace: [a], add: [b] })],
			['replace and remove', () => ({ replace: [b], remove: [a] })],
		] as const) {
			it(`${name} together are refused before the server, and nothing changes`, async () => {
				await expectOneOperationPerPath(
					buildListStringPatch(Owner, 'tags', Tag, patch()),
					'tags',
				);
				expect(await tagsOf()).toEqual([a]);
			});
		}

		for (const [name, update] of [
			[
				'$addToSet and $pullAll',
				() => ({
					$addToSet: { tags: { $each: [b] } },
					$pullAll: { tags: [a] },
				}),
			],
			[
				'$addToSet and a bare path',
				() => ({ $addToSet: { tags: { $each: [b] } }, tags: [a] }),
			],
			[
				'$pullAll and a bare path',
				() => ({ $pullAll: { tags: [a] }, tags: [b] }),
			],
		] as const) {
			it(`${name} on one path, sent anyway, is what MongoDB refuses (code 40)`, async () => {
				await expect(apply(update())).rejects.toMatchObject({
					code: 40,
					codeName: 'ConflictingUpdateOperators',
					message: "Updating the path 'tags' would create a conflict at 'tags'",
				});
				expect(await tagsOf()).toEqual([a]);
			});
		}

		it('replace: [] beside add is no conflict, and applies the add', async () => {
			await apply(
				await buildListStringPatch(Owner, 'tags', Tag, {
					replace: [],
					add: [b],
				}),
			);
			expect(await tagsOf()).toEqual([a, b]);
		});

		it('is not a document assignment: assigned and saved, an add changes nothing', async () => {
			const doc = await Owner.findById(ownerId).exec();
			Object.assign(
				doc as any,
				await buildListStringPatch(Owner, 'tags', Tag, { add: [b] }),
			);
			await (doc as any).save();
			expect(await tagsOf()).toEqual([a]);
		});
	});

	describe('buildListStringPatchUpdate through updateOne', () => {
		const update = (patch: object) =>
			Owner.updateOne({ _id: ownerId }, patch).exec();

		it('set', async () => {
			await update(
				await buildListStringPatchUpdate('names', { replace: ['y'] }),
			);
			expect(await namesOf()).toEqual(['y']);
		});

		it('add', async () => {
			await update(
				await buildListStringPatchUpdate('names', { add: ['x', 'y'] }),
			);
			expect(await namesOf()).toEqual(['x', 'y']);
		});

		it('remove', async () => {
			await update(
				await buildListStringPatchUpdate('names', { remove: ['x'] }),
			);
			expect(await namesOf()).toEqual([]);
		});

		it('empty changes nothing', async () => {
			await update(await buildListStringPatchUpdate('names', {}));
			expect(await namesOf()).toEqual(['x']);
		});
	});

	describe('resolveListStringPatch through assign and save', () => {
		const save = async (patch: object, filter = {}) => {
			const doc = (await Owner.findById(ownerId).exec()) as any;
			const tags = await resolveListStringPatch(doc.tags, Tag, patch, filter);
			if (tags !== undefined) doc.tags = tags;
			await doc.save();
			return tags;
		};

		it('set', async () => {
			await save({ replace: [b, UNKNOWN] });
			expect(await tagsOf()).toEqual([b]);
		});

		it('add, dropping an unknown id and one the filter excludes', async () => {
			await save({ add: [b, UNKNOWN, inactive] }, { active: true });
			expect(await tagsOf()).toEqual([a, b]);
		});

		it('remove', async () => {
			await save({ remove: [a] });
			expect(await tagsOf()).toEqual([]);
		});

		it('add and remove together', async () => {
			await save({ add: [b], remove: [a] });
			expect(await tagsOf()).toEqual([b]);
		});

		it('empty answers undefined and changes nothing', async () => {
			expect(await save({})).toBeUndefined();
			expect(await tagsOf()).toEqual([a]);
		});

		it('reads a populated path', async () => {
			const doc = (await Owner.findById(ownerId)
				.populate('tags')
				.exec()) as any;
			expect(await resolveListStringPatch(doc.tags, Tag, { add: [b] })).toEqual(
				[a, b],
			);
		});
	});

	describe('patchListString and patchListObjectId through assign and save', () => {
		it('patchListString on a string path: set, add, remove, empty', async () => {
			const cases: [object, string[]][] = [
				[{ add: ['y'] }, ['x', 'y']],
				[{ remove: ['x'] }, ['y']],
				[{}, ['y']],
				[{ replace: ['z'] }, ['z']],
			];
			for (const [patch, expected] of cases) {
				const doc = (await Owner.findById(ownerId).exec()) as any;
				doc.names = patchListString([...doc.names], patch);
				await doc.save();
				expect(await namesOf()).toEqual(expected);
			}
		});

		it('patchListString spread into $set applies through findOneAndUpdate', async () => {
			const doc = (await Owner.findById(ownerId).lean().exec()) as any;
			await apply({
				$set: { names: patchListString(doc.names, { add: ['y'] }) },
			});
			expect(await namesOf()).toEqual(['x', 'y']);
		});

		it('patchListObjectId on an ObjectId path: set, add, remove, empty', async () => {
			const cases: [object, string[]][] = [
				[{ add: [b] }, [a, b]],
				[{ remove: [a] }, [b]],
				[{}, [b]],
				[{ replace: [a] }, [a]],
			];
			for (const [patch, expected] of cases) {
				const doc = (await Owner.findById(ownerId).exec()) as any;
				doc.tags = patchListObjectId(doc.tags, patch);
				await doc.save();
				expect(await tagsOf()).toEqual(expected);
			}
		});

		it('patchListObjectId reads a populated path', async () => {
			const doc = (await Owner.findById(ownerId)
				.populate('tags')
				.exec()) as any;
			doc.tags = patchListObjectId(doc.tags, { add: [b] });
			await doc.save();
			expect(await tagsOf()).toEqual([a, b]);
		});
	});
});
