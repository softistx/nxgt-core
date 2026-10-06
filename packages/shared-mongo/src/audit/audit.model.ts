import { logger } from '@nxgt/shared-logging';
import { redis } from 'bun';
import type { HydratedDocument, Model, mongo } from 'mongoose';
import { model, Schema } from 'mongoose';
import { pagination } from '../plugins/pagination';
import { CommitType } from './audit.types';
import { AUDIT_EVENT } from './audit.utils';

export interface Audit {
	id: string;
	type: string;
	globalId: string;
	author: string;
	state: any;
	properties: string[];
	changes: any[];
	version: number;
}

export type AuditDocument = HydratedDocument<Audit>;

type AuditModel = Model<AuditDocument, object, object, object>;

const schema = new Schema<AuditDocument, AuditModel, object, object, object>(
	{
		type: {
			type: String,
			enum: [CommitType.INITIAL, CommitType.UPDATE, CommitType.TERMINAL],
		},
		author: String,
		globalId: { type: String, required: true },
		state: { type: Schema.Types.Mixed, required: true },
		properties: [{ type: String, required: true }],
		changes: [{ type: Schema.Types.Mixed, required: true }],
		version: { type: Number, required: true, default: 0 },
	},
	{
		timestamps: { createdAt: 'date', updatedAt: false },
		versionKey: false,
	},
);

(() => {
	pagination(schema);
})();

export const AuditModel = model('Audit', schema);

// Typed through mongoose's own `mongo`, so the declaration never names
// `mongodb`, which this package does not declare.
export const AUDIT_CHANGE_STREAM: mongo.ChangeStream<any, any> =
	AuditModel.watch([
		{
			$match: {
				operationType: 'insert',
			},
		},
	]);

(() => {
	AUDIT_CHANGE_STREAM.on('change', async (data) => {
		try {
			await redis.publish(
				AUDIT_EVENT,
				JSON.stringify(await AuditModel.findById(data.documentKey._id)),
			);
		} catch (error) {
			logger.error(error);
		}
	});
})();
