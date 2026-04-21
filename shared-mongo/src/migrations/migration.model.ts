import type { HydratedDocument, Model } from 'mongoose';
import { model, Schema } from 'mongoose';
import type { MigrationRecord, MigrationStatus } from './migration.types';

export type MigrationDocument = HydratedDocument<MigrationRecord>;

type MigrationModel = Model<MigrationDocument>;

const migrationSchema = new Schema<MigrationDocument, MigrationModel>(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		batch: {
			type: Number,
			required: true,
		},
		status: {
			type: String,
			enum: ['up', 'failed'] satisfies MigrationStatus[],
			required: true,
		},
		executedAt: {
			type: Date,
			required: true,
		},
		duration: {
			type: Number,
			required: true,
		},
		error: {
			type: String,
		},
	},
	{
		collection: 'migrations',
		versionKey: false,
	},
);

export const MigrationModel = model<MigrationDocument, MigrationModel>(
	'Migration',
	migrationSchema,
);
