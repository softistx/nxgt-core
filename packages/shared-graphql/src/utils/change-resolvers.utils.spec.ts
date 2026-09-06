import { describe, expect, it } from 'bun:test';
import { createChangeResolvers } from './change-resolvers.utils';

const COLLECTION = 'beds';

function createContext() {
	const calls: Record<string, any[]> = {};

	return {
		calls,
		context: {
			services: {
				audit: {
					findChangesPaginatedByCollection: (
						collection: string,
						args: unknown,
					) => {
						calls.byCollection = [collection, args];
						return 'by-collection';
					},
					findChangesPaginatedByCollectionAndOid: (
						oid: string,
						collection: string,
						args: unknown,
					) => {
						calls.byOid = [oid, collection, args];
						return 'by-oid';
					},
					extractId: (audit: any) => audit.globalId.split('/')[1],
					matches: (audit: any, filter: { collection: string }) =>
						audit.globalId.startsWith(`${filter.collection}/`),
				},
				beds: {
					findById: (id: string) => ({ id }),
				},
			},
		} as any,
	};
}

function createResolvers() {
	return createChangeResolvers({
		entity: 'bed',
		collection: COLLECTION,
		service: 'beds',
		pubsub: { subscribe: () => [] },
	});
}

describe('createChangeResolvers', () => {
	it('Should name the resolvers after the entity', () => {
		const changes = createResolvers();

		expect(Object.keys(changes.Query)).toEqual([
			'bedChanges',
			'bedChangesById',
		]);
		expect(Object.keys(changes.Subscription)).toEqual(['bedChanged']);
	});

	it('Should delegate the paginated changes query to the audit service', async () => {
		const changes = createResolvers();
		const { context, calls } = createContext();
		const args = { first: 10 };

		await expect(changes.Query.bedChanges({}, args, context)).resolves.toBe(
			'by-collection',
		);
		expect(calls.byCollection).toEqual([COLLECTION, args]);
	});

	it('Should delegate the by-id changes query with the requested oid', async () => {
		const changes = createResolvers();
		const { context, calls } = createContext();
		const args = { id: 'oid-1', first: 10 };

		await expect(changes.Query.bedChangesById({}, args, context)).resolves.toBe(
			'by-oid',
		);
		expect(calls.byOid).toEqual(['oid-1', COLLECTION, args]);
	});

	it('Should resolve the changed payload with the current entity state', async () => {
		const changes = createResolvers();
		const { context } = createContext();

		const result = await changes.Subscription.bedChanged.resolve(
			{
				globalId: `${COLLECTION}/oid-1`,
				type: 'UPDATE',
				state: { _id: 'oid-1' },
			},
			{},
			context,
		);

		expect(result).toEqual({
			id: 'oid-1',
			data: { id: 'oid-1' },
			type: 'UPDATE',
		});
	});

	it('Should resolve terminal commits without re-reading the deleted entity', async () => {
		const changes = createResolvers();
		const { context } = createContext();

		const result = await changes.Subscription.bedChanged.resolve(
			{
				globalId: `${COLLECTION}/oid-1`,
				type: 'TERMINAL',
				state: { _id: 'oid-1' },
			},
			{},
			context,
		);

		expect(result).toEqual({ id: 'oid-1', data: null, type: 'TERMINAL' });
	});

	it('Should expose a subscribe function', () => {
		const changes = createResolvers();

		expect(typeof changes.Subscription.bedChanged.subscribe).toBe('function');
	});

	it('Should resolve the pubsub lazily when given a getter', () => {
		let instances = 0;
		const changes = createChangeResolvers({
			entity: 'bed',
			collection: COLLECTION,
			service: 'beds',
			pubsub: () => {
				instances += 1;
				return { subscribe: () => [] };
			},
		});

		expect(instances).toBe(0);
		expect(typeof changes.Subscription.bedChanged.subscribe).toBe('function');
	});
});
