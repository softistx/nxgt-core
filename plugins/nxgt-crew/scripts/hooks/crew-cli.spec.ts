/**
 * The crew CLI end to end: `crew.ts` spawned as the `/crew` skill runs it,
 * against the temporary registry of `hooks.harness.ts`.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREW, home, repo, sandbox } from './hooks.harness';

sandbox();

async function crew(...args: string[]) {
	const proc = Bun.spawn(['bun', CREW, '--session', 'cli-1', ...args], {
		cwd: repo,
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, NXGT_CREW_HOME: home },
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { out, err, code };
}

describe('crew announce', () => {
	test('an empty --entry is refused', async () => {
		const r = await crew('announce', '--kind', 'plan', '--entry', '  ', 'x');
		expect(r.code).toBe(1);
		expect(r.err).toContain('--entry cannot be empty');
	});

	test('--drop without --kind plan is refused', async () => {
		const r = await crew('announce', '--kind', 'note', '--drop', 'x');
		expect(r.code).toBe(1);
		expect(r.err).toContain('--drop withdraws a plan');
	});

	test('a flag given as a value is refused', async () => {
		const r = await crew('announce', '--kind', 'plan', '--entry', '--drop');
		expect(r.code).toBe(1);
		expect(r.err).toContain('--entry needs a value');
		const last = await crew('announce', '--kind', 'plan', '--entry');
		expect(last.code).toBe(1);
		expect(last.err).toContain('--entry needs a value');
	});

	test('--drop records a tombstone with the default text', async () => {
		const r = await crew(
			'announce',
			'--kind',
			'plan',
			'--entry',
			'Mail',
			'--scope',
			'nxgt-janus',
			'--drop',
		);
		expect(r.code).toBe(0);
		expect(r.out).toContain('dropped Mail');
		const record = JSON.parse(
			readFileSync(join(home, 'sessions', 'cli-1.json'), 'utf8'),
		);
		expect(record.announcements[0]).toMatchObject({
			text: 'dropped Mail',
			kind: 'plan',
			entry: 'Mail',
			scope: 'nxgt-janus',
			dropped: true,
		});
	});
});
