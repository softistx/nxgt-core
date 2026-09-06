import type { HydratedDocument, Model } from 'mongoose';
import { model, models, Schema } from 'mongoose';
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

// Compiled once per mongoose instance. This module is evaluated more than once
// in a single process — a test run that loads several files does it — and
// `model()` throws `OverwriteModelError` the second time, at import, before any
// test body runs.
export const MigrationModel =
	(models.Migration as MigrationModel | undefined) ??
	model<MigrationDocument, MigrationModel>('Migration', migrationSchema);
