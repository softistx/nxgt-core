import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MigrationDefinition } from './migration.types';
import {
	createMigrationFile,
	isMigrationFile,
	loadMigrationFiles,
	migrationName,
	migrationTimestamp,
	sortMigrationsAsc,
	sortMigrationsDesc,
} from './migration.utils';

function def(name: string): MigrationDefinition {
	return { name, filePath: name, up: async () => undefined };
}

describe('isMigrationFile', () => {
	test('Should accept a 14-digit timestamp and kebab description', () => {
		expect(isMigrationFile('20260421120000-add-user-indexes.ts')).toBe(true);
	});

	test('Should accept a short numeric prefix', () => {
		expect(isMigrationFile('1-initial_setup.ts')).toBe(true);
	});

	test('Should refuse helpers, other extensions, and missing prefixes', () => {
		expect(isMigrationFile('helpers.ts')).toBe(false);
		expect(isMigrationFile('20260421120000-add-user-indexes.js')).toBe(false);
		expect(isMigrationFile('add-user-indexes.ts')).toBe(false);
		expect(isMigrationFile('README.md')).toBe(false);
	});
});

describe('migrationName and migrationTimestamp', () => {
	test('Should strip the extension and return the numeric prefix', () => {
		expect(migrationName('20260421120000-add-user-indexes.ts')).toBe(
			'20260421120000-add-user-indexes',
		);
		expect(migrationTimestamp('20260421120000-add-user-indexes')).toBe(
			'20260421120000',
		);
		expect(migrationTimestamp('123-abc')).toBe('123');
	});
});

describe('sortMigrationsAsc / sortMigrationsDesc', () => {
	test('Should sort by the numeric prefix, not lexicographically', () => {
		const input = [def('10-later'), def('2-earlier'), def('2-earlier-b')];

		expect(sortMigrationsAsc(input).map((m) => m.name)).toEqual([
			'2-earlier',
			'2-earlier-b',
			'10-later',
		]);
		expect(sortMigrationsDesc(input).map((m) => m.name)).toEqual([
			'10-later',
			'2-earlier',
			'2-earlier-b',
		]);
	});
});

describe('createMigrationFile', () => {
	let dir: string;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	test('Should write a timestamped file that exports up and down', async () => {
		dir = await mkdtemp(join(tmpdir(), 'migration-create-'));
		const filePath = await createMigrationFile(dir, 'Add User Indexes!');
		const filename = filePath.slice(dir.length + 1);

		expect(filename).toMatch(/^\d{14}-add-user-indexes\.ts$/);

		const source = await Bun.file(filePath).text();
		expect(source).toContain('export async function up');
		expect(source).toContain('export async function down');
	});
});

describe('loadMigrationFiles', () => {
	let dir: string;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	test('Should skip non-migration files and sort the rest', async () => {
		dir = await mkdtemp(join(tmpdir(), 'migration-load-'));
		await writeFile(
			join(dir, '2-second.ts'),
			'export async function up() {}\n',
		);
		await writeFile(
			join(dir, '10-tenth.ts'),
			'export async function up() {}\nexport async function down() {}\n',
		);
		await writeFile(join(dir, 'helpers.ts'), 'export const n = 1;\n');

		const loaded = await loadMigrationFiles(dir);
		expect(loaded.map((m) => m.name)).toEqual(['2-second', '10-tenth']);
		expect(loaded[1]?.down).toBeFunction();
		expect(loaded[0]?.down).toBeUndefined();
	});

	test('Should throw when a migration file does not export up', async () => {
		dir = await mkdtemp(join(tmpdir(), 'migration-noup-'));
		await writeFile(
			join(dir, '1-no-up.ts'),
			'export async function down() {}\n',
		);

		await expect(loadMigrationFiles(dir)).rejects.toThrow(
			'migrations.errors.missing-up-export: 1-no-up.ts',
		);
	});

	test('Should throw when the directory does not exist', async () => {
		await expect(
			loadMigrationFiles(join(tmpdir(), 'migration-missing-does-not-exist')),
		).rejects.toThrow('migrations.errors.directory-not-found:');
	});
});
