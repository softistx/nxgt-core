import { omit } from 'lodash';
import type { Document } from 'mongoose';

export const toObject = <T>(
	doc: Document<T> | null,
	...omitFields: string[]
) => {
	if (!doc) return null;
	return {
		...omit(doc.toObject({ getters: true, virtuals: true, versionKey: true }), [
			'_id',
			...omitFields,
		]),
	} as any;
};

export const toObjects = <T>(docs: Document<T>[], ...omitFields: string[]) =>
	docs.map((doc) => toObject(doc, ...omitFields));
