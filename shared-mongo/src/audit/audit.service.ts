import type { QueryFilter } from 'mongoose';
import { castAsync } from '../../helpers';
import type { IPaginatedType, PaginationOptions } from '../plugins';
import { type Audit, type AuditDocument, AuditModel } from './audit.model';
import type { Change } from './audit.types';

export class AuditService {
	private model = AuditModel;

	async findChangesPaginated<T>(options: PaginationOptions) {
		return castAsync<IPaginatedType<Change<T>>>(this.model.paginate(options));
	}

	async findChanges<T>(filter: QueryFilter<AuditDocument> = {}) {
		return this.model.find<Change<T>>(filter ?? {});
	}

	matches(audit: Audit, filter: { collection: string; type: string }) {
		return (
			audit.globalId.startsWith(`${filter.collection}/`) &&
			filter.type === audit.type
		);
	}
}
