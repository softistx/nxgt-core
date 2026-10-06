import { CustomException } from '@nxgt/shared-exceptions';
import { Model, type Schema } from 'mongoose';

export function applySoftDeleteOperations(schema: Schema) {
	schema.static('softDeleteById', async function () {
		const exists = await this.exists({
			_id: arguments?.[0],
			deleted: { $ne: true },
		});
		if (!exists)
			throw CustomException.notFound({ message: 'errors.not-found' });
		return this.findOneAndUpdate(
			{
				_id: arguments?.[0],
				deleted: { $ne: true },
			},
			{ lastModifiedBy: arguments?.[1], deleted: true },
			arguments?.[2],
		);
	});
	schema.static('restoreById', async function () {
		const exists = await this.exists({ _id: arguments?.[0], deleted: true });
		if (!exists)
			throw CustomException.notFound({ message: 'errors.not-found' });
		return this.findOneAndUpdate(
			{
				_id: arguments?.[0],
				deleted: true,
			},
			{ lastModifiedBy: arguments?.[1], deleted: false },
			arguments?.[2],
		);
	});

	const methods = [
		'find',
		'findOne',
		'countDocuments',
		'findOneAndReplace',
		'findOneAndUpdate',
		'updateOne',
		'updateMany',
		'replaceOne',
		'aggregate',
	];

	methods.forEach((method) => {
		if (['count', 'find', 'countDocuments'].includes(method)) {
			schema.static(method, function () {
				const args: any[] = [];
				Array.prototype.push.apply(args, arguments as any);
				args[0] = { ...args?.[0], deleted: { $ne: true } };
				return (Model as any)[method].apply(this, args);
			});
			schema.static(`${method}Deleted`, function () {
				const args: any[] = [];
				Array.prototype.push.apply(args, arguments as any);
				args[0] = { ...args?.[0], deleted: true };
				return (Model as any)[method].apply(this, args);
			});
			schema.static(`${method}WithDeleted`, function () {
				return (Model as any)[method].apply(this, arguments);
			});
		} else {
			if (method === 'aggregate') {
				// mongoose's signature is aggregate(pipeline?, options?): the stages
				// arrive as one array, not one argument each.
				schema.static(method, function (pipeline?: any[], options?: any) {
					return (Model as any)[method].call(
						this,
						withLeadingMatch(pipeline, { deleted: { $ne: true } }),
						options,
					);
				});
				schema.static(
					`${method}Deleted`,
					function (pipeline?: any[], options?: any) {
						return (Model as any)[method].call(
							this,
							withLeadingMatch(pipeline, { deleted: { $eq: true } }),
							options,
						);
					},
				);
				// `aggregateWidthDeleted`: the original misspelling, kept as an alias.
				schema.statics[`${method}WithDeleted`] = schema.statics[
					`${method}WidthDeleted`
				] = function () {
					return (Model as any)[method].apply(this, arguments);
				};
			} else {
				schema.statics[method] = function () {
					return (Model as any)[method]
						.apply(this, arguments)
						.where({ deleted: { $ne: true } });
				};

				schema.statics[`${method}Deleted`] = function () {
					return (Model as any)[method]
						.apply(this, arguments)
						.where({ deleted: { $eq: true } });
				};

				schema.statics[`${method}WithDeleted`] = function () {
					return (Model as any)[method].apply(this, arguments);
				};
			}
		}
	});
}

/**
 * Stages the server only accepts at the head of a pipeline.
 */
const FIRST_STAGE_ONLY = [
	'$geoNear',
	'$search',
	'$searchMeta',
	'$vectorSearch',
];

/**
 * `pipeline` with `$match` placed at its head — or right after a stage that
 * must stay first, such as `$geoNear`. It is folded into a `$match` already in
 * that place unless that one names `deleted` itself, in which case it goes in
 * as a stage of its own, so the caller's condition is never overwritten (the
 * server merges adjacent `$match` stages). The caller's array and stage
 * objects are left as they were.
 */
function withLeadingMatch(
	pipeline: any[] | undefined,
	$match: Record<string, unknown>,
): any[] {
	const stages = [...(pipeline ?? [])];
	const head = stages[0];
	const at = head && FIRST_STAGE_ONLY.some((stage) => stage in head) ? 1 : 0;
	const target = stages[at];
	if (target?.$match && !('deleted' in target.$match)) {
		stages[at] = { ...target, $match: { ...target.$match, ...$match } };
	} else {
		stages.splice(at, 0, { $match });
	}
	return stages;
}
