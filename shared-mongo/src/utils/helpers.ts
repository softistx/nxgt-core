import type { ListStringPatch } from '@nxgt/shared/models';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import { isNil } from 'lodash';
import type { Model, PipelineStage, QueryFilter, UpdateQuery } from 'mongoose';
import mongoose from 'mongoose';

/** Whether `name` currently exists as a *view* rather than as a collection. */
async function isView(name: string): Promise<boolean> {
	const db = mongoose.connection.db;
	if (!db) return false;

	const [existing] = await db.listCollections({ name }).toArray();
	return existing?.type === 'view';
}

/**
 * (Re)creates `viewModel`'s namespace as a MongoDB view over `model`.
 *
 * The drop-then-create is retried because it races the view model's own
 * `autoCreate`/`autoIndex`: Mongoose materialises the namespace as an ordinary
 * collection when it initialises the model, and if that lands between the drop
 * and the create, the create fails with `NamespaceExists` and the app is left
 * querying an empty collection that will never return a row. It only shows up
 * on a *fresh* database — an existing one already has the view — which is
 * exactly when nobody is watching, so the result is verified rather than
 * assumed, and a definitive failure is logged loudly instead of silently.
 */
export async function safeCreateView<T, R>(
	model: Model<T, any, any, any, any, any, any>,
	viewModel: Model<R, any, any, any, any, any, any>,
	pipeline: PipelineStage[] = [],
	attempts = 3,
) {
	try {
		await model.createCollection();
	} catch (error) {
		logger.error(
			`Error creating collection for model ${model.modelName}:`,
			error,
		);
	}
	const viewName = viewModel.collection.name;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await mongoose.connection.dropCollection(viewName);
			logger.info(`Dropped existing view for model ${viewModel.modelName}`);
		} catch (error) {
			// Nothing to drop on a fresh database — expected, not a failure.
			logger.debug(
				`No existing namespace to drop for model ${viewModel.modelName}: ${error}`,
			);
		}

		try {
			await viewModel.createCollection({
				viewOn: model.collection.name,
				pipeline,
			});
		} catch (error) {
			logger.error(
				`Error creating view for model ${viewModel.modelName}:`,
				error,
			);
		}

		if (await isView(viewName)) return;

		logger.warn(
			`${viewName} is not a view after attempt ${attempt}/${attempts} — retrying`,
		);
	}

	logger.error(
		`Failed to create view ${viewName} for model ${viewModel.modelName}: it exists as a plain collection, so every query through it will come back empty.`,
	);
}

/**
 * Resolves a list patch against the values a document already holds and
 * returns the whole resulting list.
 *
 * Use this from `buildUpdateData`. Its sibling `buildListStringPatch` returns
 * MongoDB update operators, which only mean anything to `findOneAndUpdate` —
 * `MongoCrudService.update()` assigns onto a document and calls `save()`, where
 * a key named `$addToSet` is an unknown property Mongoose drops without a
 * word. An `add` then looked applied and changed nothing.
 *
 * Ids are validated against `model` exactly like the operator builder does, so
 * an unknown id is dropped rather than stored.
 *
 * @param current - The list the document holds today; populated docs, raw ids or ObjectIds all work.
 * @param model - The Mongoose model of the items in the list.
 * @param value - The add / remove / replace patch, if the caller sent one.
 * @param filter - Extra conditions the referenced items must satisfy.
 * @returns The resulting list of ids, or undefined when there is nothing to change.
 */
export async function resolveListStringPatch<T>(
	current: unknown,
	model: Model<T, any, any, any, any, any, any>,
	value?: ListStringPatch,
	filter: QueryFilter<T> = {},
): Promise<string[] | undefined> {
	if (
		!value?.replace?.length &&
		!value?.add?.length &&
		!value?.remove?.length
	) {
		return undefined;
	}

	const idsOf = async (ids?: string[]) =>
		ids?.length
			? (await model.find({ _id: ids, ...filter }).exec()).map(
					(item: { _id: unknown }) => String(item._id),
				)
			: [];

	if (value.replace?.length) {
		return idsOf(value.replace);
	}

	// An autopopulated path holds documents rather than ids, so read through
	// whatever shape is there instead of assuming one.
	const held = (Array.isArray(current) ? current : []).map((item) =>
		String((item as { _id?: unknown })?._id ?? item),
	);
	const removed = new Set(value.remove ?? []);

	return [
		...new Set([
			...held.filter((id) => !removed.has(id)),
			...(await idsOf(value.add)),
		]),
	];
}

/**
 * Builds a MongoDB update query for adding, removing, or replacing items in a list of strings.
 *
 * Only usable through `findOneAndUpdate` and friends — see
 * `resolveListStringPatch` for the document-assignment path.
 *
 * @param _source - The Mongoose model of the source document.
 * @param path - The path of the list field to be updated.
 * @param model - The Mongoose model of the items in the list.
 * @param value - An object containing arrays of strings to add, remove, or replace.
 * @param filter - An optional filter to apply when validating the existence of items to be added, removed, or replaced.
 * @returns An update query object for MongoDB.
 */
export async function buildListStringPatch<T, S>(
	_source: Model<S, any, any, any, any, any, any>,
	path: keyof S,
	model: Model<T, any, any, any, any, any, any>,
	value?: ListStringPatch,
	filter: QueryFilter<T> = {},
): Promise<UpdateQuery<S>> {
	const add = value?.add?.length
		? (
				await model
					.find({
						_id: value.add,
						...filter,
					})
					.exec()
			).map((item: { _id: unknown }) => item._id)
		: [];
	const remove = value?.remove?.length
		? (
				await model
					.find({
						_id: value.remove,
						...filter,
					})
					.exec()
			).map((item: { _id: unknown }) => item._id)
		: [];
	const replace = value?.replace?.length
		? (
				await model
					.find({
						_id: value.replace,
						...filter,
					})
					.exec()
			).map((item: { _id: unknown }) => item._id)
		: [];
	return {
		...(value?.add?.length && {
			$addToSet: {
				[path]: {
					$each: add,
				},
			},
		}),
		...(value?.remove?.length && {
			$pullAll: {
				[path]: remove,
			},
		}),
		...(value?.replace?.length && {
			[path]: replace,
		}),
	} as UpdateQuery<S>;
}

/**
 * Builds a MongoDB update query for adding, removing, or replacing items in a list of strings.
 *
 * @param path - The path of the list field to be updated.
 * @param value - An object containing arrays of strings to add, remove, or replace.
 * @returns An update query object for MongoDB.
 */
export async function buildListStringPatchUpdate<T>(
	path: keyof T,
	value?: ListStringPatch,
): Promise<UpdateQuery<T>> {
	const add = value?.add ?? [];
	const remove = value?.remove ?? [];
	const replace = value?.replace ?? [];
	return {
		...(add.length && {
			$addToSet: {
				[path]: {
					$each: add,
				},
			},
		}),
		...(remove.length && {
			$pullAll: {
				[path]: remove,
			},
		}),
		...(replace.length && {
			[path]: replace,
		}),
	} as UpdateQuery<T>;
}

export function checkVersion(modelVersion: number, version?: number) {
	if (isNil(version)) {
		return;
	}
	if (modelVersion !== version) {
		throw CustomException.badRequest({
			message: 'errors.optimistic-lock-failed',
		});
	}
}
