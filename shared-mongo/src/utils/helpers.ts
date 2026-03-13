import type { ListStringPatch } from '@nxgt/shared/models';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import { isNil } from 'lodash';
import type { Model, PipelineStage, QueryFilter, UpdateQuery } from 'mongoose';
import mongoose from 'mongoose';

export async function safeCreateView<T, R>(
	model: Model<T>,
	viewModel: Model<R>,
	pipeline: PipelineStage[] = [],
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

	try {
		await mongoose.connection.dropCollection(viewName);
		logger.info(`Dropped existing view for model ${viewModel.modelName}`);
	} catch (error) {
		logger.error(
			`Error dropping existing view for model ${viewModel.modelName}:`,
			error,
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
}

/**
 * Builds a MongoDB update query for adding, removing, or replacing items in a list of strings.
 *
 * @param _source - The Mongoose model of the source document.
 * @param path - The path of the list field to be updated.
 * @param model - The Mongoose model of the items in the list.
 * @param value - An object containing arrays of strings to add, remove, or replace.
 * @param filter - An optional filter to apply when validating the existence of items to be added, removed, or replaced.
 * @returns An update query object for MongoDB.
 */
export async function buildListStringPatch<T, S>(
	_source: Model<S>,
	path: keyof S,
	model: Model<T>,
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
			).map((item) => item._id)
		: [];
	const remove = value?.remove?.length
		? (
				await model
					.find({
						_id: value.remove,
						...filter,
					})
					.exec()
			).map((item) => item._id)
		: [];
	const replace = value?.replace?.length
		? (
				await model
					.find({
						_id: value.replace,
						...filter,
					})
					.exec()
			).map((item) => item._id)
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
