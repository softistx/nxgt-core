import 'mongoose';
import type {
	CursorPaginateOptions,
	ICursorPaginatedType,
	IPaginatedType,
	NestedPaginationOptions,
	PaginateOptions,
} from './types';

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
			filter: PaginateOptions,
		): Promise<IPaginatedType<TRawDocType>>;

		paginate<_ResultDoc = THydratedDocumentType>(
			filter: PaginateOptions,
			projection: ProjectionType<TRawDocType> | null | undefined,
		): Promise<IPaginatedType<TRawDocType>>;

		paginate<_ResultDoc = THydratedDocumentType>(
			filter: PaginateOptions,
			projection: ProjectionType<TRawDocType> | null | undefined,
			options:
				| (QueryOptions<TRawDocType> & {
						lean: true;
				  })
				| undefined,
		): Promise<IPaginatedType<TRawDocType>>;

		cursorPaginate<_ResultDoc = THydratedDocumentType>(
			filter: CursorPaginateOptions,
		): Promise<ICursorPaginatedType<TRawDocType>>;

		cursorPaginate<_ResultDoc = THydratedDocumentType>(
			filter: CursorPaginateOptions,
			projection: ProjectionType<TRawDocType> | null | undefined,
		): Promise<ICursorPaginatedType<TRawDocType>>;

		cursorPaginate<_ResultDoc = THydratedDocumentType>(
			filter: CursorPaginateOptions,
			projection: ProjectionType<TRawDocType> | null | undefined,
			options:
				| (QueryOptions<TRawDocType> & {
						lean: true;
				  })
				| undefined,
		): Promise<ICursorPaginatedType<TRawDocType>>;

		paginateList(
			docs: THydratedDocumentType[],
			options: NestedPaginationOptions,
		): Promise<IPaginatedType<TRawDocType>>;
	}
}
