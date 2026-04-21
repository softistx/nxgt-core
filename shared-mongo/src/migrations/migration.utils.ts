import { readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createLogger } from '@nxgt/shared-logging';
import type { MigrationDefinition } from './migration.types';

export const logger = createLogger({ name: 'migrations' });

// ─── Filename validation ──────────────────────────────────────────────────────

/**
 * Valid kebab-case migration filename pattern:
 *   `<14-digit-timestamp>-<description>.ts`
 *
 * Examples:
 *   - `20260421120000-add-user-indexes.ts`
 *   - `20260421130000-migrate-contact-format.ts`
 */
const MIGRATION_FILE_PATTERN = /^\d{13,14}-[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/;

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
 */
export function migrationTimestamp(name: string): string {
	return name.slice(0, 14);
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sorts migration definitions in ascending timestamp order (oldest first).
 * This is the natural execution order for `up()`.
 */
export function sortMigrationsAsc(
	migrations: MigrationDefinition[],
): MigrationDefinition[] {
	return [...migrations].sort((a, b) =>
		migrationTimestamp(a.name).localeCompare(migrationTimestamp(b.name)),
	);
}

/**
 * Sorts migration definitions in descending timestamp order (newest first).
 * This is the natural execution order for `down()`.
 */
export function sortMigrationsDesc(
	migrations: MigrationDefinition[],
): MigrationDefinition[] {
	return [...migrations].sort((a, b) =>
		migrationTimestamp(b.name).localeCompare(migrationTimestamp(a.name)),
	);
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
