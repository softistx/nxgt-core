import { afterAll, describe, expect, test } from 'bun:test';
import { GhError, RateLimitedError } from './github';
import { PACKAGES_TTL_MS, repoPackages } from './repo-packages';
import { fakeRunner, type RunRule } from './runner.fixtures';
import { removeTempDirs, tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

const NOW = Date.parse('2026-10-10T12:00:00Z');
const blob = (name: string) => ({ text: JSON.stringify({ name }) });
const dir = (name: string, manifest?: string) => ({
	name,
	object: {
		entries: [
			{ name: 'src', object: {} },
			...(manifest ? [{ name: 'package.json', object: blob(manifest) }] : []),
		],
	},
});
const answer = (data: unknown, over: { code?: number; stderr?: string } = {}) =>
	({
		argv: ['gh', 'api', 'graphql'],
		result: { stdout: JSON.stringify({ data }), ...over },
	}) satisfies RunRule;

function setup(rule: RunRule | undefined, now = NOW) {
	const runner = fakeRunner({ run: rule ? [rule] : [] });
	const home = tempDir('pkgs');
	let clock = now;
	const ctx = { runner, home, now: () => clock };
	return {
		runner,
		ctx,
		at: (t: number) => {
			clock = t;
		},
	};
}

describe('repoPackages', () => {
	test('reads the root name and every packages/* manifest, with no cap', async () => {
		const dirs = Array.from({ length: 9 }, (_, i) =>
			dir(`d${i}`, `@zorblax/p${i}`),
		);
		const { runner, ctx } = setup(
			answer({
				p0: {
					root: blob('zorblax'),
					dirs: { entries: [...dirs, dir('docs'), { name: 'x', object: {} }] },
				},
			}),
		);
		const map = await repoPackages(ctx, ['softistx/zorblax-core']);
		expect(map.get('softistx/zorblax-core')).toEqual([
			'zorblax',
			...dirs.map((_, i) => `@zorblax/p${i}`),
		]);
		expect(runner.calls).toHaveLength(1);
		const query = runner.calls[0]?.argv.join(' ') ?? '';
		expect(query).toContain('HEAD:package.json');
		expect(query).toContain('HEAD:packages');
	});

	test('a missing root and packages directory means it publishes nothing, and that is cached', async () => {
		const { runner, ctx } = setup(answer({ p0: { root: null, dirs: null } }));
		expect(
			(await repoPackages(ctx, ['softistx/vexora-docs'])).get(
				'softistx/vexora-docs',
			),
		).toEqual([]);
		await repoPackages(ctx, ['softistx/vexora-docs']);
		expect(runner.calls).toHaveLength(1);
	});

	test('a partial error leaves the null repository uncached and asks again', async () => {
		const { runner, ctx } = setup(
			answer(
				{ p0: { root: blob('acme'), dirs: null }, p1: null },
				{ code: 1, stderr: 'Could not resolve to a Repository' },
			),
		);
		const repos = ['softistx/acme-a', 'softistx/acme-b'];
		const map = await repoPackages(ctx, repos);
		expect([...map.keys()]).toEqual(['softistx/acme-a']);
		await repoPackages(ctx, repos);
		expect(runner.calls).toHaveLength(2);
		const second = runner.calls[1]?.argv.join(' ') ?? '';
		expect(second).toContain('acme-b');
		expect(second).not.toContain('acme-a');
	});

	test.each([
		'HTTP 502: Bad Gateway',
		'HTTP 403: Resource not accessible',
		'timeout',
	])('a transient failure (%s) throws and caches nothing', async (stderr) => {
		const { runner, ctx } = setup({
			argv: ['gh', 'api', 'graphql'],
			result: { code: 1, stderr },
		});
		await expect(repoPackages(ctx, ['softistx/acme-a'])).rejects.toBeInstanceOf(
			GhError,
		);
		await expect(repoPackages(ctx, ['softistx/acme-a'])).rejects.toBeInstanceOf(
			GhError,
		);
		expect(runner.calls).toHaveLength(2);
	});

	test('a rate limit throws RateLimitedError', async () => {
		const { ctx } = setup({
			argv: ['gh', 'api', 'graphql'],
			result: { code: 1, stderr: 'HTTP 429: API rate limit exceeded' },
		});
		await expect(repoPackages(ctx, ['softistx/acme-a'])).rejects.toBeInstanceOf(
			RateLimitedError,
		);
	});

	test('an entry is fresh for 24 hours, then read again', async () => {
		const { runner, ctx, at } = setup(
			answer({ p0: { root: blob('acme'), dirs: null } }),
		);
		await repoPackages(ctx, ['softistx/acme-a']);
		at(NOW + PACKAGES_TTL_MS - 1);
		await repoPackages(ctx, ['softistx/acme-a']);
		expect(runner.calls).toHaveLength(1);
		at(NOW + PACKAGES_TTL_MS);
		await repoPackages(ctx, ['softistx/acme-a']);
		expect(runner.calls).toHaveLength(2);
	});

	test('asks for nothing when every repository is cached or the list is empty', async () => {
		const { runner, ctx } = setup(undefined);
		expect((await repoPackages(ctx, [])).size).toBe(0);
		expect(runner.calls).toHaveLength(0);
	});
});
