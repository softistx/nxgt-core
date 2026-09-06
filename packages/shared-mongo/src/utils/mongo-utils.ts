import { auditChanges } from '../audit';
import { applyPlugins } from '../plugins';
import { castError } from './error.utils';

import * as helpers from './helpers';
import * as mappers from './mappers';

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
		optimisticConcurrency: true,
	},
	auditPipeline: [
		{
			$match: {
				operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
			},
		},
	],
};
