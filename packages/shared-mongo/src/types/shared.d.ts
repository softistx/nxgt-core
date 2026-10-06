import type { LocaleKey } from '@nxgt/i18n';
import type { ErrorProps, StatusCode } from '@nxgt/shared-exceptions';

declare module 'mongoose' {
	export interface SaveOptions extends SessionOption {
		withUser?: string;
	}

	/*
	 * Every augmentation of `Model` must repeat mongoose's type parameter names
	 * (types/models.d.ts, `interface Model<TRawDocType, …, TLeanResultType>`) and
	 * nothing else. TypeScript requires all declarations to have identical type
	 * parameters, but lets defaults and heritage live on one declaration only, so
	 * leaving them to mongoose keeps this file valid for any 9.x whose names match.
	 * Copying them is how `TQueryHelpers = object` (mongoose says `{}`) and a
	 * redeclared `schema: Schema<TRawDocType>` raised TS2428 and TS2717 for every
	 * consumer with `skipLibCheck: false`. Mongoose already declares `schema`.
	 */
	export interface Model<
		TRawDocType,
		TQueryHelpers,
		TInstanceMethods,
		TVirtuals,
		THydratedDocumentType,
		TSchema,
		TLeanResultType,
	> {
		/**
		 * Throw not found if no document exists in the database that matches
		 * the given `filter`.
		 */
		ensureExists(
			filter: QueryFilter<TRawDocType>,
			options?: { message?: LocaleKey; options?: Record<string, any> },
		): Promise<void>;

		/**
		 * Find a document by its id and throw if not found.
		 * @param id The id of the document to find
		 * @param errorProps Properties for the error to throw if not found
		 * @returns The found document
		 */
		requireById(
			id?: any,
			errorProps?: ErrorProps & { code?: StatusCode },
		): Promise<THydratedDocumentType>;
	}
}
