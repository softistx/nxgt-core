import { mongoose } from '../mongoose';
import { MigrationRunner } from './migration.runner';
import type { RunDownOptions, RunUpOptions } from './migration.types';

// ─── Programmatic options ─────────────────────────────────────────────────────

export interface MigrateOptions {
	/** Absolute or relative path to the directory containing migration files */
	migrationsDir: string;
	/**
	 * MongoDB connection URI.
	 * Defaults to `process.env.MONGODB_URI` when omitted.
	 */
	uri?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveUri(options: MigrateOptions): string {
	const uri = options.uri ?? Bun.env.MONGODB_URI;
	if (!uri) {
		throw new Error(
			'migrations.errors.missing-uri: provide `uri` in options or set MONGODB_URI',
		);
	}
	return uri;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run all pending migrations, or a specific one by name.
 *
 * Connects to MongoDB, executes, then disconnects — fully self-contained.
 *
 * @example
 * ```ts
 * import { migrateUp } from '@nxgt/shared-mongo';
 *
 * await migrateUp({ migrationsDir: './src/migrations' });
 *
 * // Target a specific migration
 * await migrateUp(
 *   { migrationsDir: './src/migrations' },
 *   { name: '20260421120000-add-user-indexes' },
 * );
 * ```
 */
export async function migrateUp(
	options: MigrateOptions,
	runOptions?: RunUpOptions,
): Promise<void> {
	const uri = resolveUri(options);
	await mongoose.connect(uri);
	const runner = new MigrationRunner({
		migrationsDir: options.migrationsDir,
		connection: mongoose.connection,
	});
	try {
		await runner.up(runOptions);
	} finally {
		await mongoose.disconnect();
	}
}

/**
 * Rollback the last batch of migrations, or a specific one by name.
 *
 * Connects to MongoDB, executes, then disconnects — fully self-contained.
 *
 * @example
 * ```ts
 * import { migrateDown } from '@nxgt/shared-mongo';
 *
 * await migrateDown({ migrationsDir: './src/migrations' });
 *
 * // Rollback a specific migration
 * await migrateDown(
 *   { migrationsDir: './src/migrations' },
 *   { name: '20260421120000-add-user-indexes' },
 * );
 * ```
 */
export async function migrateDown(
	options: MigrateOptions,
	runOptions?: RunDownOptions,
): Promise<void> {
	const uri = resolveUri(options);
	await mongoose.connect(uri);
	const runner = new MigrationRunner({
		migrationsDir: options.migrationsDir,
		connection: mongoose.connection,
	});
	try {
		await runner.down(runOptions);
	} finally {
		await mongoose.disconnect();
	}
}

/**
 * List all migrations found in `migrationsDir` with their current status.
 *
 * Connects to MongoDB, queries, then disconnects — fully self-contained.
 *
 * @example
 * ```ts
 * import { migrateList } from '@nxgt/shared-mongo';
 *
 * const entries = await migrateList({ migrationsDir: './src/migrations' });
 * console.table(entries);
 * ```
 */
export async function migrateList(options: MigrateOptions) {
	const uri = resolveUri(options);
	await mongoose.connect(uri);
	const runner = new MigrationRunner({
		migrationsDir: options.migrationsDir,
		connection: mongoose.connection,
	});
	try {
		return await runner.list();
	} finally {
		await mongoose.disconnect();
	}
}

/**
 * Lower-level helper: run a callback with an already-configured `MigrationRunner`,
 * managing the connection lifecycle automatically.
 *
 * Use this when you need full control (e.g. embedding migrations inside a
 * larger startup script that also does other work on the connection).
 *
 * @example
 * ```ts
 * import { withMigrationRunner } from '@nxgt/shared-mongo';
 *
 * await withMigrationRunner({ migrationsDir: './src/migrations' }, async (runner) => {
 *   const list = await runner.list();
 *   console.table(list);
 *   await runner.up();
 * });
 * ```
 */
export async function withMigrationRunner<T>(
	options: MigrateOptions,
	fn: (runner: MigrationRunner) => Promise<T>,
): Promise<T> {
	const uri = resolveUri(options);
	await mongoose.connect(uri);
	const runner = new MigrationRunner({
		migrationsDir: options.migrationsDir,
		connection: mongoose.connection,
	});
	try {
		return await fn(runner);
	} finally {
		await mongoose.disconnect();
	}
}
