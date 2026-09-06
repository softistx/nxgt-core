import { castAsync } from '@nxgt/shared/helpers';
import type { QueryFilter } from 'mongoose';
import type { IConnection, PaginationOptions } from '../models';
import { type Audit, type AuditDocument, AuditModel } from './audit.model';
import type { Change } from './audit.types';

export class AuditService {
	private model = AuditModel;

	async findChangesPaginated<T>(options: PaginationOptions) {
		return castAsync<IConnection<Change<T>>>(this.model.paginate(options));
	}

	findChangesPaginatedByCollectionAndOid<T>(
		oid: string,
		collection: string,
		options: PaginationOptions,
	) {
		const collectionFilter: QueryFilter<AuditDocument> = {
			globalId: { $regex: `^${collection}/${oid}$` },
		};
		const filter: QueryFilter<AuditDocument> = options.filter
			? {
					$and: [collectionFilter, options.filter],
				}
			: collectionFilter;
		return this.findChangesPaginated<T>({ ...options, filter });
	}

	findChangesPaginatedByCollection<T>(
		collection: string,
		options: PaginationOptions,
	) {
		const collectionFilter: QueryFilter<AuditDocument> = {
			globalId: { $regex: `^${collection}/` },
		};
		const filter: QueryFilter<AuditDocument> = options.filter
			? {
					$and: [collectionFilter, options.filter],
				}
			: collectionFilter;
		return this.findChangesPaginated<T>({ ...options, filter });
	}

	async findChanges<T>(filter: QueryFilter<AuditDocument> = {}) {
		return this.model.find<Change<T>>(filter ?? {});
	}

	matches(audit: Audit, filter: { collection: string; type?: string }) {
		return (
			audit.globalId.startsWith(`${filter.collection}/`) &&
			(filter.type ? filter.type === audit.type : true)
		);
	}

	extractId(audit: Audit) {
		return audit.globalId.split('/')[1];
	}
}
