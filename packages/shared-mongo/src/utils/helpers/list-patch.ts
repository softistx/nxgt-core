import type { ListStringPatch } from '@nxgt/shared/models';
import type { Model, QueryFilter, UpdateQuery } from 'mongoose';
import mongoose from 'mongoose';
import type { Populated } from '../models';
import { isValidObjectID } from '../object-id.utils';

/**
 * Applies a list patch to a plain list of strings.
 *
 * Synchronous, and therefore purely syntactic: unlike
 * {@link resolveListStringPatch} it does not ask the database whether the ids
 * exist, so an unknown id survives here where the async one drops it. Use this
 * when the caller has already established what the ids are.
 */
export function patchListString(
	list: string[] = [],
	patch?: ListStringPatch | null,
) {
	if (!patch) {
		return list;
	}
	const add = patch.add ?? [];
	const remove = patch.remove ?? [];
	const replace = patch.replace ?? [];
	let result = [...list, ...add];
	result = result.filter((item) => !remove.includes(item));
	if (replace.length) {
		result = replace;
	}
	return Array.from(new Set(result));
}

/** {@link patchListString} over a path holding ObjectIds or populated docs. */
export function patchListObjectId(
	list: mongoose.Types.ObjectId[] | Populated<any>[] = [],
	patch?: ListStringPatch | null,
) {
	const values = list.map((item) =>
		item instanceof mongoose.Types.ObjectId
			? item.toHexString()
			: item._id.toHexString(),
	);
	return patchListString(values, patch)
		.filter(isValidObjectID)
		.map((id) => new mongoose.Types.ObjectId(id));
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

	// ListStringPatch's fields are nullable, so null reaches here as well as
	// undefined; the length guard below answers for both.
	const idsOf = async (ids?: string[] | null) =>
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
