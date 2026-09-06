import type { HydratedDocument } from 'mongoose';
import type { IConnection, NestedPaginationOptions } from '../models';
import { paginateListData } from '../plugins/pagination/utils';

export function paginateList<T extends HydratedDocument<{ id: string }>>(
	docs: T[],
	options: NestedPaginationOptions,
): IConnection<T> {
	return paginateListData(docs, options);
}
