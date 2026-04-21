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
	/** Options passed to `MigrationRunner.up()` when `operation` is `'up'` */
	run?: RunUpOptions;
	/** Options passed to `MigrationRunner.down()` when `operation` is `'down'` */
	down?: RunDownOptions;
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
 * Run a specific migration operation.
 *
 * Connects to MongoDB, executes, then disconnects — fully self-contained.
 *
 * @example
 * ```ts
 * import { migrate } from '@nxgt/shared-mongo';
 *
 * await migrate('up', { migrationsDir: './src/migrations' });
 *
 * // Target a specific migration
 * await migrate(
 *   'up',
 *   {
 *     migrationsDir: './src/migrations',
 *     run: { name: '20260421120000-add-user-indexes' },
 *   },
 * );
 * ```
 */
export async function migrate(
	operation: 'up' | 'down' | 'list' = 'list',
	options: MigrateOptions,
): Promise<void> {
	const uri = resolveUri(options);
	await mongoose.connect(uri);
	const runner = new MigrationRunner({
		migrationsDir: options.migrationsDir,
		connection: mongoose.connection,
	});
	try {
		await runner[operation](options[operation]);
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
