import type { mongo } from 'mongoose';

declare module 'mongoose' {
	/*
	 * Same type parameter names as mongoose's own `interface Model` (types/models.d.ts),
	 * without defaults, constraints or heritage: TypeScript takes those from mongoose's
	 * declaration, and any that differ — `object` for `{}`, a redeclared `schema` — is
	 * TS2428/TS2717 for every consumer that checks libraries (`skipLibCheck: false`).
	 * See the note in shared.d.ts.
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
		softDeleteById<ResultDoc = THydratedDocumentType>(
			id: mongo.ObjectId | any,
			autor?: string,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'softDelete',
			TInstanceMethods
		>;

		restoreById<ResultDoc = THydratedDocumentType>(
			id: mongo.ObjectId | any,
			autor?: string,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'restore',
			TInstanceMethods
		>;

		countDocumentsDeleted(
			filter?: QueryFilter<TRawDocType>,
			options?:
				| (mongo.CountOptions & MongooseBaseQueryOptions<TRawDocType>)
				| null,
		): QueryWithHelpers<
			number,
			THydratedDocumentType,
			TQueryHelpers,
			TRawDocType,
			'countDocumentsDeleted',
			TInstanceMethods
		>;

		countDocumentsWithDeleted(
			filter?: QueryFilter<TRawDocType>,
			options?:
				| (mongo.CountOptions & MongooseBaseQueryOptions<TRawDocType>)
				| null,
		): QueryWithHelpers<
			number,
			THydratedDocumentType,
			TQueryHelpers,
			TRawDocType,
			'countDocumentsWithDeleted',
			TInstanceMethods
		>;

		findOneDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection: ProjectionType<TRawDocType> | null | undefined,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<TRawDocType, TRawDocType, 'findOneDeleted'> | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneDeleted',
			TInstanceMethods
		>;

		findOneWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection: ProjectionType<TRawDocType> | null | undefined,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<TRawDocType, TRawDocType, 'findOneWithDeleted'> | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneWithDeleted',
			TInstanceMethods
		>;

		findOneDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneDeleted',
			TInstanceMethods
		>;

		findOneWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneWithDeleted',
			TInstanceMethods
		>;

		findOneDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneDeleted',
			TInstanceMethods
		>;

		findOneWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneWithDeleted',
			TInstanceMethods
		>;

		findOneDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneDeleted',
			TInstanceMethods
		>;

		findOneWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneWithDeleted',
			TInstanceMethods
		>;

		findDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection: ProjectionType<TRawDocType> | null | undefined,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<TRawDocType, TRawDocType[], 'findDeleted'>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findDeleted',
			TInstanceMethods
		>;

		findWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection: ProjectionType<TRawDocType> | null | undefined,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<TRawDocType, TRawDocType[], 'findWithDeleted'>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findWithDeleted',
			TInstanceMethods
		>;

		findDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null | undefined,
			options?: QueryOptions<TRawDocType> | null | undefined,
		): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findDeleted',
			TInstanceMethods
		>;

		findWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null | undefined,
			options?: QueryOptions<TRawDocType> | null | undefined,
		): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findWithDeleted',
			TInstanceMethods
		>;

		findDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null | undefined,
		): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findDeleted',
			TInstanceMethods
		>;

		findWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			projection?: ProjectionType<TRawDocType> | null | undefined,
		): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findWithDeleted',
			TInstanceMethods
		>;

		findDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
		): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findDeleted',
			TInstanceMethods
		>;

		findWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
		): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findWithDeleted',
			TInstanceMethods
		>;

		findDeleted<ResultDoc = THydratedDocumentType>(): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findDeleted',
			TInstanceMethods
		>;

		findWithDeleted<ResultDoc = THydratedDocumentType>(): QueryWithHelpers<
			Array<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findWithDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			replacement: TRawDocType | AnyObject,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<TRawDocType, TRawDocType, 'findOneAndReplace'> | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			replacement: TRawDocType | AnyObject,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<TRawDocType, TRawDocType, 'findOneAndReplace'> | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceWithDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			replacement: TRawDocType | AnyObject,
			options: QueryOptions<TRawDocType> & { includeResultMetadata: true },
		): QueryWithHelpers<
			ModifyResult<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			replacement: TRawDocType | AnyObject,
			options: QueryOptions<TRawDocType> & { includeResultMetadata: true },
		): QueryWithHelpers<
			ModifyResult<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceWithDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			replacement: TRawDocType | AnyObject,
			options: QueryOptions<TRawDocType> & { upsert: true } & ReturnsNewDoc,
		): QueryWithHelpers<
			ResultDoc,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			replacement: TRawDocType | AnyObject,
			options: QueryOptions<TRawDocType> & { upsert: true } & ReturnsNewDoc,
		): QueryWithHelpers<
			ResultDoc,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceWithDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			replacement?: TRawDocType | AnyObject,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceDeleted',
			TInstanceMethods
		>;

		findOneAndReplaceWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			replacement?: TRawDocType | AnyObject,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndReplaceWithDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & {
				includeResultMetadata: true;
				lean: true;
			},
		): QueryWithHelpers<
			ModifyResult<TRawDocType>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & {
				includeResultMetadata: true;
				lean: true;
			},
		): QueryWithHelpers<
			ModifyResult<TRawDocType>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateWithDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<
				TRawDocType,
				TRawDocType,
				'findOneAndUpdateDeleted'
			> | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & { lean: true },
		): QueryWithHelpers<
			GetLeanResultType<
				TRawDocType,
				TRawDocType,
				'findOneAndUpdateWithDeleted'
			> | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateWithDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & { includeResultMetadata: true },
		): QueryWithHelpers<
			ModifyResult<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & { includeResultMetadata: true },
		): QueryWithHelpers<
			ModifyResult<ResultDoc>,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateWithDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & { upsert: true } & ReturnsNewDoc,
		): QueryWithHelpers<
			ResultDoc,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateWithDeleted<ResultDoc = THydratedDocumentType>(
			filter: QueryFilter<TRawDocType>,
			update: UpdateQuery<TRawDocType>,
			options: QueryOptions<TRawDocType> & { upsert: true } & ReturnsNewDoc,
		): QueryWithHelpers<
			ResultDoc,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateWithDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			update?: UpdateQuery<TRawDocType>,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateDeleted',
			TInstanceMethods
		>;

		findOneAndUpdateWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			update?: UpdateQuery<TRawDocType>,
			options?: QueryOptions<TRawDocType> | null,
		): QueryWithHelpers<
			ResultDoc | null,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'findOneAndUpdateWithDeleted',
			TInstanceMethods
		>;

		replaceOneDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			replacement?: TRawDocType | AnyObject,
			options?: (mongo.ReplaceOptions & QueryOptions<TRawDocType>) | null,
		): QueryWithHelpers<
			UpdateWriteOpResult,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'replaceOneDeleted',
			TInstanceMethods
		>;

		replaceOneWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			replacement?: TRawDocType | AnyObject,
			options?: (mongo.ReplaceOptions & QueryOptions<TRawDocType>) | null,
		): QueryWithHelpers<
			UpdateWriteOpResult,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'replaceOneWithDeleted',
			TInstanceMethods
		>;

		updateManyDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			update?: UpdateQuery<TRawDocType> | UpdateWithAggregationPipeline,
			options?:
				| (mongo.UpdateOptions & MongooseUpdateQueryOptions<TRawDocType>)
				| null,
		): QueryWithHelpers<
			UpdateWriteOpResult,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'updateManyDeleted',
			TInstanceMethods
		>;

		updateManyWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			update?: UpdateQuery<TRawDocType> | UpdateWithAggregationPipeline,
			options?:
				| (mongo.UpdateOptions & MongooseUpdateQueryOptions<TRawDocType>)
				| null,
		): QueryWithHelpers<
			UpdateWriteOpResult,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'updateManyWithDeleted',
			TInstanceMethods
		>;

		updateOneDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			update?: UpdateQuery<TRawDocType> | UpdateWithAggregationPipeline,
			options?:
				| (mongo.UpdateOptions & MongooseUpdateQueryOptions<TRawDocType>)
				| null,
		): QueryWithHelpers<
			UpdateWriteOpResult,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'updateOneDeleted',
			TInstanceMethods
		>;

		updateOneWithDeleted<ResultDoc = THydratedDocumentType>(
			filter?: QueryFilter<TRawDocType>,
			update?: UpdateQuery<TRawDocType> | UpdateWithAggregationPipeline,
			options?:
				| (mongo.UpdateOptions & MongooseUpdateQueryOptions<TRawDocType>)
				| null,
		): QueryWithHelpers<
			UpdateWriteOpResult,
			ResultDoc,
			TQueryHelpers,
			TRawDocType,
			'updateOneWithDeleted',
			TInstanceMethods
		>;
	}
}
