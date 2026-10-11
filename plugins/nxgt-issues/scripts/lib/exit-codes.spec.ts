import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { grep, seeded } from './app-side.fixtures';
import { main } from './cli';
import { harness, makeApp, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import { DenyListIncomplete } from './deny-sources';
import { exitForError } from './filing';
import { GhError, RateLimitedError } from './github';
import { MarkerLookupError } from './markers-types';

afterAll(removeTempDirs);

describe('exitForError: one mapping for every command', () => {
	const cases: [string, unknown, number][] = [
		['a rate limit', new RateLimitedError(1), EXIT.rateLimited],
		[
			'an incomplete deny-list',
			new DenyListIncomplete('no list'),
			EXIT.refusedScrub,
		],
		[
			'a marker lookup that stopped on a rate limit',
			new MarkerLookupError('GitHub rate limit reached.', EXIT.rateLimited),
			EXIT.rateLimited,
		],
		[
			'a marker lookup that stopped on a gh failure',
			new MarkerLookupError('gh failed.', EXIT.failed),
			EXIT.failed,
		],
		['a gh failure', new GhError(['api'], 1, 'boom'), EXIT.failed],
		['any other Error', new TypeError('nope'), EXIT.failed],
		['a thrown string', 'oops', EXIT.failed],
		['a thrown null', null, EXIT.failed],
	];

	test.each(cases)('%s', (_name, error, code) => {
		const h = harness({ cwd: makeApp() });
		expect(exitForError(h.ctx, error)).toBe(code as never);
		expect(h.err.join('\n')).not.toBe('');
		// messages are for the person, not the data stream
		expect(h.out).toEqual([]);
	});
});

describe('every command ends in an exit code, never a stack trace', () => {
	test('markers: a git that cannot be spawned exits 6', async () => {
		const h = seeded({
			run: [{ argv: ['git', 'grep'], throws: 'spawn git ENOENT' }],
		});
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.failed);
		expect(h.err.join('\n')).toContain('ENOENT');
	});

	test('markers: a lookup that throws something unexpected exits 6', async () => {
		const h = seeded({
			fetch: [{ url: 'ghost', throws: 'timeout' }],
			run: [grep('src/a.ts:1:// Temporary, until @nxgt/ghost#3\n')],
		});
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.failed);
	});

	test('markers: a rate limit exits 5 with the message on stderr', async () => {
		const h = seeded({
			run: [
				{
					argv: ['gh', 'api', 'repos/softistx/nxgt-widget'],
					result: { code: 1, stderr: 'HTTP 429 rate limit exceeded' },
				},
				grep('src/a.ts:1:// Temporary, until @nxgt/widget#12\n'),
			],
		});
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.rateLimited);
		expect(h.err.join('\n')).toContain('rate limit');
		expect(h.out).toEqual([]);
	});

	test('ready: a rate limit exits 5', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [
				{
					argv: ['gh', 'api', 'graphql'],
					result: { code: 1, stderr: 'API rate limit exceeded' },
				},
			],
		});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.rateLimited);
		expect(h.out).toEqual([]);
	});

	test('dashboard: a failure that is no gh error exits 6', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [{ argv: ['gh', 'search'], result: { stdout: 'not json' } }],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.failed);
		expect(h.err.join('\n')).toContain('unparseable');
	});
});

describe('NXGT_ISSUES_DISABLE', () => {
	test('exits 2 (a refused gate), so exit 1 of `markers` only ever means flagged or usage', async () => {
		const entry = join(import.meta.dir, '..', 'issues.ts');
		const child = Bun.spawn(['bun', entry, 'markers'], {
			env: { ...process.env, NXGT_ISSUES_DISABLE: '1' },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [code, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		expect(code).toBe(EXIT.refusedGate);
		expect(stdout).toBe('');
		expect(stderr).toContain('NXGT_ISSUES_DISABLE');
	});
});
