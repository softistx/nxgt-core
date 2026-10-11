import { afterAll, describe, expect, test } from 'bun:test';
import {
	callsOf,
	harness,
	makeApp,
	PKG,
	removeTempDirs,
	repoJson,
} from './cli.fixtures';

afterAll(removeTempDirs);

import { GATE_TTL_MS, REGISTRY_TIMEOUT_MS, resolvePackage } from './resolve';
import type { Runner } from './runner';

const NOW = Date.parse('2026-10-10T12:00:00Z');

describe('resolvePackage', () => {
	test('the registry names the repository; the gate records it public', async () => {
		const h = harness({ cwd: makeApp() });
		const result = await resolvePackage(h.ctx, PKG);
		expect(result).toEqual({
			ok: true,
			package: PKG,
			repo: { owner: 'softistx', repo: 'nxgt-widget' },
			private: false,
			installed: '1.3.0',
			latest: '1.4.0',
		});
		expect(h.runner.fetches[0]).toBe(
			'https://registry.npmjs.org/@nxgt%2Fwidget/latest',
		);
	});

	test('the registry is asked with a 2 s timeout', async () => {
		const h = harness({ cwd: makeApp() });
		const timeouts: (number | undefined)[] = [];
		const runner: Runner = {
			run: (argv, options) => h.runner.run(argv, options),
			fetchJson: (url, timeoutMs) => {
				timeouts.push(timeoutMs);
				return h.runner.fetchJson(url, timeoutMs);
			},
		};
		await resolvePackage({ ...h.ctx, runner }, PKG);
		expect(timeouts).toEqual([REGISTRY_TIMEOUT_MS]);
		expect(REGISTRY_TIMEOUT_MS).toBe(2000);
	});

	test('registry down: the installed copy under node_modules answers', async () => {
		const h = harness({
			cwd: `${makeApp()}/apps/web`,
			fetch: [{ url: 'registry', throws: 'timeout' }],
		});
		const result = await resolvePackage(h.ctx, PKG);
		expect(result.ok && result.repo.repo).toBe('nxgt-widget');
		expect(result.ok && result.latest).toBeUndefined();
	});

	test('no repository field anywhere refuses with a hint', async () => {
		const h = harness({
			cwd: makeApp(),
			fetch: [{ url: '/@nxgt%2Fmaterial/', json: { version: '2.0.0' } }],
		});
		const result = await resolvePackage(h.ctx, '@nxgt/material');
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe('no-repository-field');
		expect(!result.ok && result.hint).toContain('repository');
		expect(h.runner.calls).toEqual([]);
	});

	test('a package nowhere to be found', async () => {
		const h = harness({
			cwd: makeApp(),
			fetch: [{ url: 'nope', throws: '404' }],
		});
		const result = await resolvePackage(h.ctx, 'nope');
		expect(!result.ok && result.reason).toBe('unknown-package');
	});

	test('an invalid name is refused before anything runs', async () => {
		const h = harness({ cwd: makeApp() });
		const result = await resolvePackage(h.ctx, '../../etc');
		expect(!result.ok && result.reason).toBe('invalid-name');
		expect(h.runner.fetches).toEqual([]);
	});

	test('another owner: refused with no gh call', async () => {
		const h = harness({
			cwd: makeApp(),
			fetch: [
				{ url: '/left-pad/', json: { repository: 'github:someone/left-pad' } },
			],
		});
		const result = await resolvePackage(h.ctx, 'left-pad');
		expect(!result.ok && result.reason).toBe('not-owner');
		expect(h.runner.calls).toEqual([]);
	});

	test.each([
		[{ archived: true }, 'archived'],
		[{ has_issues: false }, 'issues-disabled'],
		[{ full_name: 'someone/nxgt-widget' }, 'not-owner'],
	])('gate %p refuses as %s', async (over, reason) => {
		const h = harness({
			cwd: makeApp(),
			run: [{ argv: ['gh', 'api'], result: { stdout: repoJson(over) } }],
		});
		const result = await resolvePackage(h.ctx, PKG);
		expect(!result.ok && result.reason).toBe(reason as never);
		expect(!result.ok && result.hint.length).toBeGreaterThan(10);
	});

	test('a private repository is recorded', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [
				{
					argv: ['gh', 'api'],
					result: { stdout: repoJson({ private: true }) },
				},
			],
		});
		const result = await resolvePackage(h.ctx, PKG);
		expect(result.ok && result.private).toBe(true);
	});

	test.each([
		['HTTP 404: Not Found', 'not-found'],
		['API rate limit exceeded', 'rate-limited'],
		['gh: not logged in', 'unreachable'],
	])('gh failing with %p refuses as %s', async (stderr, reason) => {
		const h = harness({
			cwd: makeApp(),
			run: [{ argv: ['gh', 'api'], result: { code: 1, stderr } }],
		});
		const result = await resolvePackage(h.ctx, PKG);
		expect(!result.ok && result.reason).toBe(reason as never);
	});

	test('the gate is cached for 24 hours', async () => {
		const cwd = makeApp();
		const first = harness({ cwd, now: NOW });
		await resolvePackage(first.ctx, PKG);
		const again = { ...first.ctx, now: () => NOW + GATE_TTL_MS - 1 };
		await resolvePackage(again, PKG);
		expect(callsOf(first.runner, 'gh', 'api')).toHaveLength(1);
		const later = { ...first.ctx, now: () => NOW + GATE_TTL_MS + 1 };
		await resolvePackage(later, PKG);
		expect(callsOf(first.runner, 'gh', 'api')).toHaveLength(2);
	});
});
