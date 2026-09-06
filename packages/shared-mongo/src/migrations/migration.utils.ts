import { readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createLogger, type Logger } from '@nxgt/shared-logging';
import type { MigrationDefinition } from './migration.types';

export const logger: Logger = createLogger({ name: 'migrations' });

// ─── Filename validation ──────────────────────────────────────────────────────

/**
 * Valid migration filename pattern:
 *   `<1-16-digit-timestamp>-<description>.ts`
 *
 * Description can contain alphanumeric characters, hyphens, and underscores.
 *
 * Examples:
 *   - `20260421120000-add-user-indexes.ts`
 *   - `1-initial_setup.ts`
 */
const MIGRATION_FILE_PATTERN = /^\d{1,16}-[a-zA-Z0-9_-]+\.ts$/;

export function isMigrationFile(filename: string): boolean {
	return MIGRATION_FILE_PATTERN.test(filename);
}

/**
 * Extracts the migration name (filename without extension).
 * e.g. `20260421120000-add-user-indexes.ts` → `20260421120000-add-user-indexes`
 */
export function migrationName(filename: string): string {
	return filename.slice(0, -extname(filename).length);
}

/**
 * Extracts the timestamp prefix from a migration name.
 * e.g. `20260421120000-add-user-indexes` → `20260421120000`
 * e.g. `123-abc` → `123`
 */
export function migrationTimestamp(name: string): string {
	return name.split('-')[0] || '';
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sorts migration definitions in ascending timestamp order (oldest first).
 * Numerical comparison of the prefix.
 */
export function sortMigrationsAsc(
	migrations: MigrationDefinition[],
): MigrationDefinition[] {
	return [...migrations].sort((a, b) => {
		const tsA = BigInt(migrationTimestamp(a.name));
		const tsB = BigInt(migrationTimestamp(b.name));
		if (tsA < tsB) return -1;
		if (tsA > tsB) return 1;
		return 0;
	});
}

/**
 * Sorts migration definitions in descending timestamp order (newest first).
 */
export function sortMigrationsDesc(
	migrations: MigrationDefinition[],
): MigrationDefinition[] {
	return [...migrations].sort((a, b) => {
		const tsA = BigInt(migrationTimestamp(a.name));
		const tsB = BigInt(migrationTimestamp(b.name));
		if (tsA < tsB) return 1;
		if (tsA > tsB) return -1;
		return 0;
	});
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Creates a new migration file with a 14-digit timestamp prefix and a boilerplate template.
 */
export async function createMigrationFile(
	migrationsDir: string,
	description: string,
): Promise<string> {
	const timestamp = new Date()
		.toISOString()
		.replace(/[-T:Z]/g, '')
		.slice(0, 14);

	// Sanitize description: replace spaces with hyphens, keep only alphanumeric, underscores, and hyphens
	const sanitized = description
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9_-]/g, '');

	const filename = `${timestamp}-${sanitized}.ts`;
	const filePath = join(resolve(migrationsDir), filename);

	const content = `import type { ClientSession, Connection } from 'mongoose';

export async function up(db: Connection, session?: ClientSession): Promise<void> {
	// TODO: Implement migration
}

export async function down(db: Connection, session?: ClientSession): Promise<void> {
	// TODO: Implement rollback
}
`;

	await writeFile(filePath, content, 'utf8');

	// Attempt to format with Biome if available
	try {
		const { spawnSync } = require('node:child_process');
		spawnSync('bunx', ['@biomejs/biome', 'format', '--write', filePath]);
	} catch {
		// Ignore if biome is not found or fails
	}

	return filePath;
}

// ─── File loader ──────────────────────────────────────────────────────────────

/**
 * Reads all valid migration files from `migrationsDir`, dynamically imports
 * each one, and returns an array of `MigrationDefinition` objects sorted in
 * ascending timestamp order (ready for `up()`).
 *
 * Only files matching the `<14-digit-timestamp>-<kebab-description>.ts` pattern
 * are considered. All other files (helpers, fixtures, etc.) are silently skipped.
 *
 * @throws {Error} If a migration file does not export an `up` function.
 */
export async function loadMigrationFiles(
	migrationsDir: string,
): Promise<MigrationDefinition[]> {
	const absoluteDir = resolve(migrationsDir);

	let filenames: string[];
	try {
		filenames = await readdir(absoluteDir);
	} catch {
		throw new Error(`migrations.errors.directory-not-found: ${absoluteDir}`);
	}

	const migrationFiles = filenames.filter(isMigrationFile);

	const definitions = await Promise.all(
		migrationFiles.map(async (filename) => {
			const filePath = join(absoluteDir, filename);
			const name = migrationName(filename);

			const module = await import(filePath);

			if (typeof module.up !== 'function') {
				throw new Error(`migrations.errors.missing-up-export: ${filename}`);
			}

			return {
				name,
				filePath,
				up: module.up,
				down: typeof module.down === 'function' ? module.down : undefined,
			} satisfies MigrationDefinition;
		}),
	);

	return sortMigrationsAsc(definitions);
}
