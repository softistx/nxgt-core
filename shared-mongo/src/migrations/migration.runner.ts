import { Mutex } from 'async-mutex';
import { MigrationModel } from './migration.model';
import type {
	MigrationDefinition,
	MigrationListEntry,
	MigrationRunnerOptions,
	RunDownOptions,
	RunUpOptions,
} from './migration.types';
import {
	loadMigrationFiles,
	logger,
	sortMigrationsAsc,
	sortMigrationsDesc,
} from './migration.utils';

const mutex = new Mutex();

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * `MigrationRunner` manages the full lifecycle of database migrations:
 *
 * - `up()`     — run all pending migrations, or a specific one by name
 * - `down()`   — rollback the last batch, or a specific migration by name
 * - `list()`   — return every known migration with its current status
 *
 * A `Mutex` ensures that concurrent invocations within the same process are
 * serialised; for multi-process safety you should use an external lock
 * (e.g. a MongoDB distributed lock) in front of the runner.
 *
 * @example
 * ```ts
 * import mongoose from '@nxgt/shared-mongo';
 * import { MigrationRunner } from '@nxgt/shared-mongo/migrations';
 *
 * await mongoose.connect(process.env.MONGODB_URI);
 *
 * const runner = new MigrationRunner({
 *   migrationsDir: './migrations',
 *   connection: mongoose.connection,
 * });
 *
 * await runner.up();
 * ```
 */
export class MigrationRunner {
	private readonly migrationsDir: string;
	private readonly connection: MigrationRunnerOptions['connection'];

	constructor(options: MigrationRunnerOptions) {
		this.migrationsDir = options.migrationsDir;
		this.connection = options.connection;
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	/**
	 * Run all pending migrations in ascending timestamp order.
	 *
	 * When `options.name` is provided only that migration is executed,
	 * regardless of whether it has already been applied.
	 */
	async up(options?: RunUpOptions): Promise<void> {
		await mutex.runExclusive(async () => {
			const allMigrations = await loadMigrationFiles(this.migrationsDir);

			if (options?.name) {
				await this.runSpecificUp(allMigrations, options.name);
			} else {
				await this.runPendingUp(allMigrations);
			}
		});
	}

	/**
	 * Rollback the last batch of migrations in descending timestamp order.
	 *
	 * When `options.name` is provided only that migration is rolled back,
	 * regardless of which batch it belongs to.
	 *
	 * Migrations without a `down` export are skipped with a warning.
	 */
	async down(options?: RunDownOptions): Promise<void> {
		await mutex.runExclusive(async () => {
			const allMigrations = await loadMigrationFiles(this.migrationsDir);

			if (options?.name) {
				await this.runSpecificDown(allMigrations, options.name);
			} else {
				await this.runLastBatchDown(allMigrations);
			}
		});
	}

	/**
	 * Returns every migration file found in `migrationsDir` combined with its
	 * persisted status from the database.
	 *
	 * Migrations that have never been executed are reported as `'pending'`.
	 */
	async list(): Promise<MigrationListEntry[]> {
		const [allMigrations, records] = await Promise.all([
			loadMigrationFiles(this.migrationsDir),
			MigrationModel.find({}).sort({ name: 1 }).lean().exec(),
		]);

		const recordByName = new Map(records.map((r) => [r.name, r]));

		return sortMigrationsAsc(allMigrations).map((migration) => {
			const record = recordByName.get(migration.name);
			if (!record) {
				return {
					name: migration.name,
					status: 'pending',
				} satisfies MigrationListEntry;
			}
			return {
				name: record.name,
				status: record.status,
				batch: record.batch,
				executedAt: record.executedAt,
			} satisfies MigrationListEntry;
		});
	}

	// ─── Up helpers ───────────────────────────────────────────────────────────

	private async runPendingUp(
		allMigrations: MigrationDefinition[],
	): Promise<void> {
		const executedNames = await this.fetchExecutedNames();
		const pending = sortMigrationsAsc(allMigrations).filter(
			(m) => !executedNames.has(m.name),
		);

		if (pending.length === 0) {
			logger.info('no pending migrations');
			return;
		}

		const batch = await this.nextBatchNumber();

		for (const migration of pending) {
			await this.executeMigrationUp(migration, batch);
		}
	}

	private async runSpecificUp(
		allMigrations: MigrationDefinition[],
		name: string,
	): Promise<void> {
		const migration = allMigrations.find((m) => m.name === name);
		if (!migration) {
			throw new Error(`migrations.errors.not-found: ${name}`);
		}

		const batch = await this.nextBatchNumber();
		await this.executeMigrationUp(migration, batch);
	}

	private async executeMigrationUp(
		migration: MigrationDefinition,
		batch: number,
	): Promise<void> {
		logger.info(`running up → ${migration.name}`);
		const start = Date.now();

		try {
			await migration.up(this.connection);
			const duration = Date.now() - start;

			// Upsert so re-running a specific migration updates its record
			await MigrationModel.findOneAndUpdate(
				{ name: migration.name },
				{
					name: migration.name,
					batch,
					status: 'up',
					executedAt: new Date(),
					duration,
					error: undefined,
				},
				{ upsert: true, new: true },
			).exec();

			logger.info(`✓ ${migration.name} (${duration}ms)`);
		} catch (err) {
			const duration = Date.now() - start;
			const errorMessage = err instanceof Error ? err.message : String(err);

			await MigrationModel.findOneAndUpdate(
				{ name: migration.name },
				{
					name: migration.name,
					batch,
					status: 'failed',
					executedAt: new Date(),
					duration,
					error: errorMessage,
				},
				{ upsert: true, new: true },
			).exec();

			logger.error(`✗ ${migration.name} — ${errorMessage}`);
			throw err;
		}
	}

	// ─── Down helpers ─────────────────────────────────────────────────────────

	private async runLastBatchDown(
		allMigrations: MigrationDefinition[],
	): Promise<void> {
		const lastBatch = await this.fetchLastBatch();
		if (lastBatch === null) {
			logger.info('nothing to roll back');
			return;
		}

		const lastBatchRecords = await MigrationModel.find({ batch: lastBatch })
			.sort({ name: -1 })
			.lean()
			.exec();

		const migrationByName = new Map(allMigrations.map((m) => [m.name, m]));

		for (const record of sortMigrationsDesc(
			lastBatchRecords
				.map((r) => migrationByName.get(r.name))
				.filter((m): m is MigrationDefinition => m !== undefined),
		)) {
			await this.executeMigrationDown(record);
		}
	}

	private async runSpecificDown(
		allMigrations: MigrationDefinition[],
		name: string,
	): Promise<void> {
		const migration = allMigrations.find((m) => m.name === name);
		if (!migration) {
			throw new Error(`migrations.errors.not-found: ${name}`);
		}
		await this.executeMigrationDown(migration);
	}

	private async executeMigrationDown(
		migration: MigrationDefinition,
	): Promise<void> {
		if (!migration.down) {
			logger.warn(`skipping down (no export) → ${migration.name}`);
			return;
		}

		logger.info(`running down → ${migration.name}`);
		const start = Date.now();

		try {
			await migration.down(this.connection);
			const duration = Date.now() - start;

			await MigrationModel.deleteOne({ name: migration.name }).exec();

			logger.info(`✓ rolled back ${migration.name} (${duration}ms)`);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`✗ rollback failed ${migration.name} — ${errorMessage}`);
			throw err;
		}
	}

	// ─── DB helpers ───────────────────────────────────────────────────────────

	private async fetchExecutedNames(): Promise<Set<string>> {
		const records = await MigrationModel.find({ status: 'up' }, { name: 1 })
			.lean()
			.exec();
		return new Set(records.map((r) => r.name));
	}

	private async fetchLastBatch(): Promise<number | null> {
		const record = await MigrationModel.findOne({ status: 'up' })
			.sort({ batch: -1 })
			.select('batch')
			.lean()
			.exec();
		return record?.batch ?? null;
	}

	private async nextBatchNumber(): Promise<number> {
		const last = await this.fetchLastBatch();
		return (last ?? 0) + 1;
	}
}
