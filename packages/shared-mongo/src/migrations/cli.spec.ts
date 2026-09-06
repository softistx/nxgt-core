import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

async function runCli(
	args: string[],
	env: Record<string, string | undefined> = {},
): Promise<{ exitCode: number; output: string }> {
	const proc = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args], {
		cwd: join(import.meta.dir, '../..'),
		env: { ...process.env, LOG_LEVEL: 'error', ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, output: `${stdout}\n${stderr}` };
}

describe('migration CLI', () => {
	test('Should exit 1 on an unknown command', async () => {
		const { exitCode, output } = await runCli(['foobar']);
		expect(exitCode).toBe(1);
		expect(output).toContain('unknown command');
	});

	test('Should exit 1 when create is missing --name', async () => {
		const { exitCode, output } = await runCli(['create']);
		expect(exitCode).toBe(1);
		expect(output).toContain('--name is required');
	});

	test('Should exit 1 when up has no Mongo URI', async () => {
		const { exitCode, output } = await runCli(['up'], { MONGODB_URI: '' });
		expect(exitCode).toBe(1);
		expect(output).toContain('MONGODB_URI is required');
	});
});
