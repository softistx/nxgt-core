import { afterAll, describe, expect, test } from 'bun:test';
import { grep, seeded } from './app-side.fixtures';
import { main } from './cli';
import {
	callsOf,
	type Harness,
	harness,
	makeApp,
	removeTempDirs,
} from './cli.fixtures';
import { EXIT } from './cli-context';

afterAll(removeTempDirs);

const NOW = Date.parse('2026-10-10T12:00:00Z');

describe('markers', () => {
	const run = (h: Harness) => main(h.ctx, ['markers']);

	test('a repository with no markers exits 0 without reading the cache', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: [grep('', 1)] });
		expect(await run(h)).toBe(EXIT.ok);
		expect(h.out).toEqual(['no markers: nothing waits for an upstream fix.']);
		expect(callsOf(h.runner, 'gh')).toEqual([]);
	});

	test('flags a released marker, with the package form resolved to its repository', async () => {
		const h = seeded({
			run: [grep('src/a.ts:10:\t// Temporary, until @nxgt/widget#12\n')],
		});
		expect(await run(h)).toBe(EXIT.flagged);
		expect(h.out[0]).toBe(
			'src/a.ts:10 ready @nxgt/widget#12: fixed and released; remove it (tracking #21)',
		);
	});

	test('the owner/repo form works too, and a waiting marker is not flagged', async () => {
		const h = seeded({
			run: [grep('src/b.ts:3:// Temporary, until softistx/nxgt-widget#13\n')],
		});
		expect(await run(h)).toBe(EXIT.ok);
		expect(h.out[0]).toBe('src/b.ts:3 waiting softistx/nxgt-widget#13');
	});

	test('a closed fix that is not released yet is not flagged', async () => {
		const h = seeded({
			run: [grep('src/c.ts:1:// Temporary, until @nxgt/widget#14\n')],
		});
		expect(await run(h)).toBe(EXIT.ok);
	});

	test('untracked: no tracking issue of this repository links the upstream', async () => {
		const h = seeded({
			run: [grep('src/d.ts:7:// Temporary, until @nxgt/widget#99\n')],
		});
		expect(await run(h)).toBe(EXIT.flagged);
		expect(h.out[0]).toContain('untracked @nxgt/widget#99');
		expect(h.out[0]).toContain(
			'no open tracking issue of this repository links',
		);
		expect(h.out[0]).toContain('softistx/nxgt-widget#99');
	});

	test('unresolvable: an unknown package and a repository gh cannot see', async () => {
		const h = seeded({
			fetch: [{ url: 'ghost', throws: 'HTTP 404' }],
			run: [
				{
					argv: ['gh', 'api', 'repos/softistx/gone'],
					result: { code: 1, stderr: 'gh: Not Found (HTTP 404)' },
				},
				grep(
					[
						'src/e.ts:2:// Temporary, until @nxgt/ghost#3',
						'src/f.ts:4:// Temporary, until softistx/gone#4',
					].join('\n'),
				),
			],
		});
		expect(await run(h)).toBe(EXIT.flagged);
		expect(h.out[0]).toContain('unresolvable @nxgt/ghost#3: unknown-package');
		expect(h.out[1]).toContain('unresolvable softistx/gone#4: not-found');
		expect(h.out[2]).toBe('2 of 2 marker(s) flagged.');
	});

	test('a repository outside the allowed owners is unresolvable', async () => {
		const h = seeded({
			run: [grep('src/g.ts:5:// Temporary, until stranger/lib#1\n')],
		});
		expect(await run(h)).toBe(EXIT.flagged);
		expect(h.out[0]).toContain('not-owner');
	});

	test('--json lists every marker with its status and the version', async () => {
		const h = seeded({
			run: [
				grep(
					[
						'src/a.ts:10:// Temporary, until @nxgt/widget#12',
						'src/b.ts:3:// Temporary, until @nxgt/widget#13',
						'README.md:9:prose about Temporary, until <package>#<n>',
					].join('\n'),
				),
			],
		});
		expect(await main(h.ctx, ['markers', '--json'])).toBe(EXIT.flagged);
		const reports = JSON.parse(h.out.join('\n'));
		expect(reports.map((r: { status: string }) => r.status)).toEqual([
			'ready',
			'waiting',
		]);
		expect(reports[0].version).toBe('1.4.0');
	});

	test('--json strings are cleaned', async () => {
		const h = seeded({
			run: [
				grep(
					`src/a${String.fromCodePoint(0x202e)}.ts:10:// Temporary, until @nxgt/widget#12`,
				),
			],
		});
		await main(h.ctx, ['markers', '--json']);
		expect(h.out.join('\n')).not.toContain(String.fromCodePoint(0x202e));
	});

	test('git grep failing outside a checkout is a failure, not "no markers"', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [
				{
					argv: ['git', 'grep'],
					result: { code: 128, stderr: 'fatal: not a git repository' },
				},
			],
		});
		expect(await run(h)).toBe(EXIT.failed);
		expect(h.err.join('\n')).toContain('not a git repository');
	});
});
