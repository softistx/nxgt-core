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
				return (Model as any)[method].apply(this, arguments);
			});
			schema.static(`${method}WithDeleted`, function () {
				return (Model as any)[method].apply(this, arguments);
			});
		} else {
			if (method === 'aggregate') {
				schema.static(method, function () {
					const $match = {
						deleted: { $ne: true },
					};
					const args: any[] = [];
					Array.prototype.push.apply(this, arguments as any);
					if (args.length && args[0].$match) {
						args[0].$match = { ...args[0].$match, ...$match };
					} else {
						args.unshift({ $match });
					}
					return (Model as any)[method].apply(this, args as any);
				});
				schema.static(`${method}Deleted`, function () {
					const $match = {
						deleted: { $eq: true },
					};
					const args: any[] = [];
					Array.prototype.push.apply(this, arguments as any);
					if (args.length && args[0].$match) {
						args[0].$match = { ...args[0].$match, ...$match };
					} else {
						args.unshift({ $match });
					}
					return (Model as any)[method].apply(this, args as any);
				});
				schema.static(`${method}WidthDeleted`, function () {
					const args: any[] = [];
					Array.prototype.push.apply(this, arguments as any);
					if (args.length && args[0].$match) {
						args[0].$match = { ...args[0].$match, deleted: undefined };
					} else {
						args.unshift({ $match: { deleted: undefined } });
					}
					return (Model as any)[method].apply(this, args as any);
				});
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
