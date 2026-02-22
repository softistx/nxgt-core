import type { LocaleKey } from '@nxgt/i18n';
import { CustomException } from '@nxgt/shared-exceptions';
import type { Schema } from 'mongoose';
import { castError } from '../utils/error.utils';

export const errors = (schema: Schema) => {
	schema.post(
		[
			'save',
			'deleteOne',
			'findOneAndDelete',
			'updateOne',
			'findOneAndUpdate',
			'replaceOne',
			'findOneAndReplace',
			'findOne',
			'countDocuments',
		],
		(error: any, _: any, next: any) => {
			if (error) {
				if (error.name === 'MongoServerError' && error.code === 11000) {
					next(
						CustomException.badRequest({
							message: 'errors.duplicate-key',
							debugMessage: error.message,
						}),
					);
				} else {
					next(castError(error));
				}
			} else {
				next();
			}
		},
	);
	schema.pre(
		[
			'deleteOne',
			'findOneAndDelete',
			'updateOne',
			'findOneAndUpdate',
			'replaceOne',
			'findOneAndReplace',
		],
		async function () {
			await this.model.findOne(this.getQuery()).exec();
		},
	);
	schema.post('findOne', async function (doc, next) {
		if (!doc) {
			const localeKey = `${this.model.collection.collectionName}.errors.not-found`;
			throw CustomException.notFound({
				message: localeKey as LocaleKey,
			});
		}
		next();
	});
};
