import { auditChanges } from './audit';
import { castError } from './error.utils';
import * as helpers from './helpers';
import * as mappers from './mappers';
import { applyPlugins } from './plugins';

export const MONGO_UTILS = {
	applyPlugins,
	castError,
	auditChanges,
	...mappers,
	...helpers,
	timestamps: { createdAt: 'createdDate', updatedAt: 'lastModifiedDate' },
	coreOptions: {
		toObject: { virtuals: true, versionKey: true },
		toJSON: { virtuals: true, versionKey: true },
		timestamps: { createdAt: 'createdDate', updatedAt: 'lastModifiedDate' },
		versionKey: 'version',
	},
	auditPipeline: [
		{
			$match: {
				operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
			},
		},
	],
};

export * from './helpers';
export * from './mappers';
export * from './models';
export * from './plugins';
export * from './schema';
export * from './validation';
