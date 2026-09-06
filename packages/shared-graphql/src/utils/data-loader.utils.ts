import { cast } from '@nxgt/shared/helpers';
import {
	type HydratedDocument,
	type IConnection,
	type Model,
	type mongoose,
	type PaginationOptions,
	paginateList,
	type QueryFilter,
	type SimplePaginationOptions,
} from '@nxgt/shared-mongo';
import DataLoader from 'dataloader';
import { isArray } from 'lodash';

export function createDataLoader<K, V>(
	batchLoadFn: DataLoader.BatchLoadFn<K, V>,
	options?: DataLoader.Options<K, V, K>,
) {
	return new DataLoader(batchLoadFn, options);
}

export function createConnectionListDataLoader<K, V>(
	path: keyof K,
	model: Model<V, any, any, any, any, any, any>,
	options: PaginationOptions,
) {
	return createDataLoader<K, IConnection<HydratedDocument<V>>>(async (docs) => {
		const data: HydratedDocument<V>[] = await model
			.find({
				...(options.filter ?? {}),
				_id: docs.flatMap((doc) => {
					const ids = doc[path] ?? [];
					return isArray(ids)
						? cast<mongoose.Schema.Types.ObjectId[]>(
								ids.filter(
									(item) =>
										!!item &&
										!['undefined', 'null'].includes((item as any)?.toString()),
								),
							)
						: [];
				}),
			})
			.exec();
		return cast(
			docs.map((doc) =>
				model.paginateList(
					data.filter((child) =>
						cast<mongoose.Schema.Types.ObjectId[]>(doc[path] ?? [])
							.map((item) => item.toString())
							.includes((child._id as any).toString()),
					),
					options,
				),
			),
		);
	});
}

export function createChildrenConnectionDataLoader<K, V>(
	path: keyof V,
	model: Model<V, any, any, any, any, any, any>,
	options: PaginationOptions,
) {
	return createDataLoader<
		HydratedDocument<K>,
		IConnection<HydratedDocument<V>>
	>(async (docs) => {
		const filter = {} as any;
		filter[path] = docs.map((doc) => doc._id);
		const data: HydratedDocument<V>[] = await model.find(filter).exec();
		return cast(
			docs.map((doc) =>
				paginateList(
					data.filter(
						(child) => doc._id?.toString() === (child[path] as any)?.toString(),
					) as any,
					options,
				),
			),
		);
	});
}

export function createSimpleListDataLoader<K, V>(
	path: keyof K,
	model: Model<V, any, any, any, any, any, any>,
	options?: SimplePaginationOptions,
) {
	return createDataLoader<K, HydratedDocument<V>[]>(async (docs) => {
		const filter: QueryFilter<any> = options?.filter ?? {};
		const ids = docs.flatMap((doc) => {
			const ids = doc[path] ?? [];
			return isArray(ids) ? cast<mongoose.Schema.Types.ObjectId[]>(ids) : [];
		});
		filter._id = ids;
		const query = model.find(filter);
		const data: HydratedDocument<V>[] = await query.exec();
		return cast(
			docs.map((doc) => {
				const result = data.filter((child) =>
					cast<mongoose.Schema.Types.ObjectId[]>(doc[path] ?? [])
						.map((item) => item.toString())
						.includes((child._id as any).toString()),
				);
				if (options?.skip && options?.limit) {
					return result.slice(options.skip, options.skip + options.limit);
				}
				if (options?.limit) {
					return result.slice(0, options.limit);
				}
				if (options?.skip) {
					return result.slice(options.skip);
				}
				return result;
			}),
		);
	});
}

export function createChildrenListDataLoader<K, V>(
	path: keyof V,
	model: Model<V, any, any, any, any, any, any>,
	options?: SimplePaginationOptions,
) {
	return createDataLoader<HydratedDocument<K>, HydratedDocument<V>[]>(
		async (docs) => {
			const filter: QueryFilter<any> = options?.filter ?? {};
			const key = path as any;
			filter[key] = docs.map((doc) => doc._id);
			const query = model.find(filter);
			const data: HydratedDocument<V>[] = await query.exec();
			return cast(
				docs.map((doc) => {
					const result = data.filter(
						(child) => child[path]?.toString() === (doc._id as any).toString(),
					);

					if (options?.skip && options?.limit) {
						return result.slice(options.skip, options.skip + options.limit);
					}
					if (options?.limit) {
						return result.slice(0, options.limit);
					}
					if (options?.skip) {
						return result.slice(options.skip);
					}
					return result;
				}),
			);
		},
	);
}

export function createSingleChildDataLoader<K, V extends { id: string }>(
	path: keyof K,
	model: Model<V, any, any, any, any, any, any>,
) {
	return createDataLoader<K, HydratedDocument<V> | null>(async (docs) => {
		const data: HydratedDocument<V>[] = await model
			.find({
				_id: docs
					.map((doc) => cast<mongoose.Schema.Types.ObjectId>(doc[path]))
					.filter(
						(item) =>
							!!item && !['undefined', 'null'].includes(item?.toString()),
					),
			})
			.exec();

		const map = new Map<string, HydratedDocument<V>>(
			data.map((doc) => [doc.id, doc]),
		);
		return docs.map((doc) => map.get(doc[path]?.toString() ?? '') ?? null);
	});
}

export function createEntitiesReferenceLoader<V extends { id: string }>(
	model: Model<V, any, any, any, any, any, any>,
) {
	return createDataLoader<string, HydratedDocument<V> | null>(async (ids) => {
		const docs: HydratedDocument<V>[] = await model
			.find({
				_id: ids.filter(
					(item) => !!item && !['undefined', 'null'].includes(item?.toString()),
				),
			})
			.exec();

		const map = new Map<string, HydratedDocument<V>>(
			docs.map((doc) => [doc.id, doc]),
		);

		return ids.map((id) => map.get(id) ?? null);
	}) as DataLoader<string, HydratedDocument<V> | null>;
}
