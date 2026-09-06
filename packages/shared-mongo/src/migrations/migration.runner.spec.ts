import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mongoose } from '../mongoose';
import { clearDatabase } from '../utils/clear-database';
import { disconnectQuietly } from './disconnect';
import { MigrationModel } from './migration.model';
import { MigrationRunner } from './migration.runner';

const PROBE_UP = `import type { ClientSession, Connection } from 'mongoose';

export async function up(db: Connection, session?: ClientSession): Promise<void> {
	await db.db!.collection('probe').insertOne({ n: 1 }, session ? { session } : {});
}

export async function down(db: Connection, session?: ClientSession): Promise<void> {
	await db.db!.collection('probe').deleteMany({}, session ? { session } : {});
}
`;

const PROBE_UP_ONLY = `import type { ClientSession, Connection } from 'mongoose';

export async function up(db: Connection, session?: ClientSession): Promise<void> {
	await db.db!.collection('probe').insertOne({ n: 1 }, session ? { session } : {});
}
`;

const THROWS_UP = `export async function up(): Promise<void> {
	throw new Error('boom');
}
`;

async function writeMigration(
	dir: string,
	name: string,
	source: string,
): Promise<void> {
	await writeFile(join(dir, `${name}.ts`), source);
}

async function probeCount(): Promise<number> {
	const db = mongoose.connection.db;
	if (!db) {
		throw new Error('mongoose is not connected');
	}
	return db.collection('probe').countDocuments();
}

describe('MigrationRunner', () => {
	let dir: string;
	let runner: MigrationRunner;

	beforeAll(async () => {
		const uri = Bun.env.MONGODB_URI;
		if (!uri) {
			throw new Error(
				'MONGODB_URI is required — run with --env-file=.env.test',
			);
		}
		await mongoose.connect(uri);
	});

	afterAll(async () => {
		await disconnectQuietly();
	});

	beforeEach(async () => {
		await clearDatabase();
		dir = await mkdtemp(join(tmpdir(), 'migration-runner-'));
		runner = new MigrationRunner({
			migrationsDir: dir,
			connection: mongoose.connection,
		});
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test('Should apply pending migrations and record them as up in one batch', async () => {
		await writeMigration(dir, '1-add-probe', PROBE_UP);
		await writeMigration(dir, '2-add-second', PROBE_UP);

		await runner.up();

		expect(await probeCount()).toBe(2);
		const records = await MigrationModel.find({}).sort({ name: 1 }).lean();
		expect(records.map((r) => r.name)).toEqual(['1-add-probe', '2-add-second']);
		expect(records.every((r) => r.status === 'up' && r.batch === 1)).toBe(true);
	});

	test('Should no-op a second up of the same files', async () => {
		await writeMigration(dir, '1-add-probe', PROBE_UP);

		await runner.up();
		await runner.up();

		expect(await probeCount()).toBe(1);
		expect(await MigrationModel.countDocuments()).toBe(1);
	});

	test('Should not write anything on dryRun', async () => {
		await writeMigration(dir, '1-add-probe', PROBE_UP);

		await runner.up({ dryRun: true });

		expect(await probeCount()).toBe(0);
		expect(await MigrationModel.countDocuments()).toBe(0);
	});

	test('Should run a named migration even if it is already up', async () => {
		await writeMigration(dir, '1-add-probe', PROBE_UP);

		await runner.up();
		await runner.up({ name: '1-add-probe' });

		expect(await probeCount()).toBe(2);
	});

	test('Should throw when the named migration does not exist', async () => {
		await expect(runner.up({ name: '9-missing' })).rejects.toThrow(
			'migrations.errors.not-found: 9-missing',
		);
	});

	test('Should record a failed up and rethrow', async () => {
		await writeMigration(dir, '1-throws', THROWS_UP);

		await expect(runner.up()).rejects.toThrow('boom');

		const record = await MigrationModel.findOne({ name: '1-throws' }).lean();
		expect(record?.status).toBe('failed');
		expect(record?.error).toBe('boom');
		expect(await probeCount()).toBe(0);
	});

	test('Should roll back the last batch and delete its records', async () => {
		await writeMigration(dir, '1-add-probe', PROBE_UP);
		await writeMigration(dir, '2-add-second', PROBE_UP);

		await runner.up();
		await runner.down();

		expect(await probeCount()).toBe(0);
		expect(await MigrationModel.countDocuments()).toBe(0);
	});

	test('Should throw when rolling back a migration with no down export', async () => {
		await writeMigration(dir, '1-no-down', PROBE_UP_ONLY);

		await runner.up();
		await expect(runner.down({ name: '1-no-down' })).rejects.toThrow(
			'migrations.errors.missing-down-export: 1-no-down',
		);
		expect(await MigrationModel.countDocuments()).toBe(1);
	});

	test('Should list pending, up, and failed statuses', async () => {
		await writeMigration(dir, '1-add-probe', PROBE_UP);
		await writeMigration(dir, '2-throws', THROWS_UP);
		await writeMigration(dir, '3-pending', PROBE_UP);

		await runner.up({ name: '1-add-probe' });
		await expect(runner.up({ name: '2-throws' })).rejects.toThrow('boom');

		const list = await runner.list();
		expect(list.map((e) => [e.name, e.status])).toEqual([
			['1-add-probe', 'up'],
			['2-throws', 'failed'],
			['3-pending', 'pending'],
		]);
	});
});
