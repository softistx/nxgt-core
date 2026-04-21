import type { ClientSession, Connection } from 'mongoose';

// ─── Migration definition ─────────────────────────────────────────────────────

export interface MigrationDefinition {
	/** Kebab-case filename without extension, e.g. `20260421120000-add-user-indexes` */
	name: string;
	/** Absolute path to the migration file */
	filePath: string;
	up(db: Connection, session?: ClientSession): Promise<void>;
	down?(db: Connection, session?: ClientSession): Promise<void>;
}

// ─── Persisted migration record ───────────────────────────────────────────────

export type MigrationStatus = 'up' | 'failed';

export interface MigrationRecord {
	/** Kebab-case filename without extension */
	name: string;
	/** Incremented each time `up()` is called; migrations in the same run share a batch number */
	batch: number;
	status: MigrationStatus;
	executedAt: Date;
	/** Execution time in milliseconds */
	duration: number;
	/** Present only when `status` is `failed` */
	error?: string;
}

// ─── Runner options ───────────────────────────────────────────────────────────

export interface MigrationRunnerOptions {
	/** Absolute path to the directory that contains migration files */
	migrationsDir: string;
	/** An already-connected Mongoose connection */
	connection: Connection;
}

export interface RunUpOptions {
	/** When provided, only this migration is executed (by name, regardless of prior status) */
	name?: string;
	/** When true, only logs what would happen without executing anything */
	dryRun?: boolean;
}

export interface RunDownOptions {
	/** When provided, only this specific migration is rolled back */
	name?: string;
	/** When true, only logs what would happen without executing anything */
	dryRun?: boolean;
}

// ─── List entry (runner output) ───────────────────────────────────────────────

export type MigrationListStatus = 'pending' | MigrationStatus;

export interface MigrationListEntry {
	name: string;
	status: MigrationListStatus;
	batch?: number;
	executedAt?: Date;
}
