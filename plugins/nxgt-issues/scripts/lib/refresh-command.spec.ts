import { afterAll, describe, expect, test } from 'bun:test';
import { main } from './cli';
import { harness, makeApp, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import { stampFresh } from './refresh-state';
import { GRAPHQL, listing } from './session.fixtures';

afterAll(removeTempDirs);

describe('issues.ts refresh', () => {
	test('refreshes the cache of the directory repository', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [{ argv: GRAPHQL, result: { stdout: listing({}) } }],
		});
		expect(await main(h.ctx, ['refresh'])).toBe(EXIT.ok);
		expect(h.out.join('\n')).toContain('softistx/acme-store: 0 open issue(s)');
	});

	test('a foreign origin makes no call', async () => {
		const h = harness({
			cwd: makeApp('git@github.com:acme/quillon.git'),
		});
		expect(await main(h.ctx, ['refresh'])).toBe(EXIT.refusedGate);
		expect(h.runner.calls).toEqual([]);
	});

	test('a rate limit exits 5, any other failure 6', async () => {
		const limited = harness({
			cwd: makeApp(),
			run: [
				{ argv: GRAPHQL, result: { code: 1, stderr: 'rate limit exceeded' } },
			],
		});
		expect(await main(limited.ctx, ['refresh'])).toBe(EXIT.rateLimited);
		const broken = harness({
			cwd: makeApp(),
			run: [{ argv: GRAPHQL, result: { stdout: 'oops' } }],
		});
		expect(await main(broken.ctx, ['refresh'])).toBe(EXIT.failed);
		// the app's own repository, not ME: the stamp is keyed by the directory's origin
		expect(
			stampFresh(
				broken.home,
				{ owner: 'softistx', repo: 'acme-store' },
				'failed',
				broken.ctx.now(),
			),
		).toBe(true);
	});
});
