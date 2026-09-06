import 'mongoose';
import type {
	IConnection,
	NestedPaginationOptions,
	PaginationOptions,
} from '../models/pagination';
import type {
	CursorPaginateOptions,
	ICursorPaginatedType,
	IPaginatedType,
	NestedOffsetPaginationOptions,
	PaginateOffsetOptions,
} from '../plugins/pagination/types';

/**
 * Five statics, because the two repositories put different meanings on
 * `paginate` and neither was tested. See `plugins/pagination/utils.ts`.
 *
 * This file is hand-written, so `tsc` passes it through rather than emitting
 * it — `build.ts` copies it into `dist/` instead. Without that copy every one
 * of these declarations disappears for a consumer.
 */
declare module 'mongoose' {
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
		paginate<_ResultDoc = THydratedDocumentType>(
			filter: PaginationOptions & {
				deleted?: 'Deleted' | 'WidthDeleted';
			} & {
				populate?: string | PopulateOptions | (string | PopulateOptions)[];
			},
			projection?: ProjectionType<TRawDocType> | null | undefined,
			options?: (QueryOptions<TRawDocType> & { lean: true }) | undefined,
		): Promise<IConnection<TRawDocType>>;

		paginateList(
			docs: THydratedDocumentType[],
			options: NestedPaginationOptions,
		): IConnection<TRawDocType>;

		paginateOffset<_ResultDoc = THydratedDocumentType>(
			filter: PaginateOffsetOptions,
			projection?: ProjectionType<TRawDocType> | null | undefined,
			options?: (QueryOptions<TRawDocType> & { lean: true }) | undefined,
		): Promise<IPaginatedType<TRawDocType>>;

		paginateListOffset(
			docs: THydratedDocumentType[],
			options: NestedOffsetPaginationOptions,
		): Promise<IPaginatedType<TRawDocType>>;

		cursorPaginate<_ResultDoc = THydratedDocumentType>(
			filter: CursorPaginateOptions,
			projection?: ProjectionType<TRawDocType> | null | undefined,
			options?: (QueryOptions<TRawDocType> & { lean: true }) | undefined,
		): Promise<ICursorPaginatedType<TRawDocType>>;
	}
}
