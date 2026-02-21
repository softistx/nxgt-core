import { type LocaleKey, translate } from '@nxgt/i18n';
import { CustomException } from '@nxgt/shared-exceptions';
import { has } from 'lodash';
import type { Schema } from 'mongoose';
import mongoose from 'mongoose';

export function applySharedOperations(schema: Schema) {
	schema.static('ensureExists', async function () {
		const result = await mongoose.Model.exists
			.apply(this, [arguments?.[0] ?? {}])
			.exec();

		if (!result) {
			const localeKey = `${this.collection.collectionName}.errors.not-found`;
			throw CustomException.notFound({
				message:
					arguments?.[1]?.message ??
					(translate(localeKey as LocaleKey) === localeKey
						? 'errors.not-found'
						: localeKey),
				options: arguments?.[1]?.options,
			});
		}
	});

	schema.static('requireById', async function () {
		try {
			const doc = await mongoose.Model.findById
				.apply(this, [arguments?.[0] ?? {}])
				.exec();
			if (!doc) {
				const localeKey = `${this.collection.collectionName}.errors.not-found`;
				throw Error(
					arguments?.[1]?.message ??
						(translate(localeKey as LocaleKey) === localeKey
							? 'errors.not-found'
							: localeKey),
				);
			}
			return doc;
		} catch (error: any) {
			throw CustomException.from({
				code: arguments?.[1]?.code ?? 400,
				message: arguments?.[1]?.message ?? error?.message,
				debugMessage: translate((error as Error).message as LocaleKey),
			});
		}
	});

	if (schema.options.versionKey) {
		schema.pre(['findOneAndUpdate'], async function () {
			const update = this.getUpdate() as any;
			if (!update) {
				return;
			}
			if (has(update, 'version')) {
				delete update.version;
			}
			const keys = ['$set', '$setOnInsert'];
			for (const key of keys) {
				if (update[key] != null && update[key].version != null) {
					delete update[key].version;
					if (Object.keys(update[key]).length === 0) {
						delete update[key];
					}
				}
			}
			update.$inc = update.$inc || {};
			update.$inc.version = 1;
		});
	}
}
