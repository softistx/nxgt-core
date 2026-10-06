import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mongoose } from '../mongoose';
import { hasMongoHost } from '../test/has-mongo-host';
import { disconnectQuietly } from './disconnect';
import { MigrationModel } from './migration.model';

describe.skipIf(!hasMongoHost())('disconnectQuietly', () => {
	test('Should close after a query without throwing', async () => {
		await mongoose.connect(Bun.env['MONGODB_URI'] as string);
		await MigrationModel.find({}).lean().exec();
		await disconnectQuietly();
	});
});

describe.skipIf(!hasMongoHost())('migration CLI teardown', () => {
	let dir: string;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	test('Should exit 0 on up without MongoClientClosedError', async () => {
		dir = await mkdtemp(join(tmpdir(), 'migration-cli-up-'));

		const proc = Bun.spawn(
			['bun', join(import.meta.dir, 'cli.ts'), 'up', '--dir', dir],
			{
				cwd: join(import.meta.dir, '../..'),
				env: {
					...process.env,
					MONGODB_URI: Bun.env['MONGODB_URI'] as string,
					NODE_ENV: 'test',
					LOG_LEVEL: 'error',
				},
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		const output = `${stdout}\n${stderr}`;

		expect(exitCode).toBe(0);
		expect(output).not.toContain('MongoClientClosedError');
		expect(output).not.toContain('client was closed');
		expect(output).not.toContain('closed connection pool');
	});
});
