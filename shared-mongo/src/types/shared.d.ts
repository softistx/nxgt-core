import type { LocaleKey } from '@nxgt/i18n';
import type { ErrorProps } from '@nxgt/shared-exceptions';
import type { StatusCode } from 'hono/utils/http-status';

declare module 'mongoose' {
	export interface SaveOptions extends SessionOption {
		withUser?: string;
	}

	export interface Model<
		TRawDocType,
		TQueryHelpers = object,
		TInstanceMethods = object,
		TVirtuals = object,
		THydratedDocumentType = HydratedDocument<
			TRawDocType,
			TVirtuals & TInstanceMethods,
			TQueryHelpers,
			TVirtuals
		>,
		TSchema = any,
		TLeanResultType = TRawDocType,
	> extends NodeJS.EventEmitter,
			IndexManager,
			SessionStarter {
		/** Schema the model uses. */
		schema: Schema<TRawDocType>;

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
