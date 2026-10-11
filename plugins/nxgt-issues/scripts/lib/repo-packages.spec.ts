import { afterAll, describe, expect, test } from 'bun:test';
import { RateLimitedError } from './github';
import {
	FAILED_TTL_MS,
	OBJECTS_PER_CALL,
	PACKAGES_TTL_MS,
	repoPackages,
} from './repo-packages';
import { fakeRunner, type RunRule } from './runner.fixtures';
import { removeTempDirs, tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

const NOW = Date.parse('2026-10-10T12:00:00Z');
const blob = (name: unknown) => ({ text: JSON.stringify({ name }) });
const tree = (...names: string[]) => ({
	entries: names.map((name) => ({ name, type: 'tree' })),
});
const GQL = ['gh', 'api', 'graphql'];
const isA = (argv: readonly string[]) =>
	argv.join(' ').includes('p0:repository');
const isB = (argv: readonly string[]) =>
	argv.join(' ').includes('b0:repository');
const reply = (
	when: (argv: readonly string[]) => boolean,
	data: unknown,
	errors?: unknown,
	code = errors ? 1 : 0,
): RunRule => ({
	argv: GQL,
	when,
	result: {
		code,
		stdout: JSON.stringify({ data, ...(errors ? { errors } : {}) }),
	},
});
const down = (stderr: string, when?: RunRule['when']): RunRule => ({
	argv: GQL,
	...(when ? { when } : {}),
	result: { code: 1, stderr },
});

function setup(...rules: RunRule[]) {
	const runner = fakeRunner({ run: rules });
	let clock = NOW;
	const ctx = { runner, home: tempDir('pkgs'), now: () => clock };
	return {
		runner,
		ctx,
		at: (t: number) => {
			clock = t;
		},
	};
}
const queries = (runner: ReturnType<typeof fakeRunner>) =>
	runner.calls.map((c) => c.argv.join(' '));

describe('repoPackages', () => {
	test('call A reads names only, call B exactly packages/<dir>/package.json', async () => {
		const { runner, ctx } = setup(
			reply(isA, { p0: { root: blob('zorblax'), dirs: tree('core', 'ui') } }),
			reply(isB, {
				b0: { object: blob('@zorblax/core') },
				b1: { object: blob('@zorblax/ui') },
			}),
		);
		const map = await repoPackages(ctx, ['softistx/zorblax-core']);
		expect(map.get('softistx/zorblax-core')).toEqual([
			'zorblax',
			'@zorblax/core',
			'@zorblax/ui',
		]);
		const [a, b] = queries(runner);
		expect(a).toContain('HEAD:package.json');
		expect(a).toContain('entries{name type}');
		expect(a).not.toContain('Blob{text}}}}}');
		expect(b).toContain('HEAD:packages/core/package.json');
		expect(b).toContain('HEAD:packages/ui/package.json');
	});

	test('directory names that are not [\\w.-] are never interpolated', async () => {
		const { runner, ctx } = setup(
			reply(isA, {
				p0: { root: null, dirs: tree('ok', 'a"b', 'x y', '$(id)') },
			}),
			reply(isB, { b0: { object: blob('@zorblax/ok') } }),
		);
		const map = await repoPackages(ctx, ['softistx/zorblax-core']);
		expect(map.get('softistx/zorblax-core')).toEqual(['@zorblax/ok']);
		expect(queries(runner)[1]).not.toMatch(/a"b|x y|\$\(id\)/);
	});

	test('more than 100 directories split call B into batches of at most 100', async () => {
		const dirs = Array.from(
			{ length: OBJECTS_PER_CALL + 20 },
			(_, i) => `d${i}`,
		);
		const { runner, ctx } = setup(
			reply(isA, { p0: { root: null, dirs: tree(...dirs) } }),
			reply(isB, {}),
		);
		await repoPackages(ctx, ['softistx/zorblax-core']);
		const b = queries(runner).slice(1);
		expect(b).toHaveLength(2);
		expect(b[0]?.match(/b\d+:repository/g)).toHaveLength(OBJECTS_PER_CALL);
		expect(b[1]?.match(/b\d+:repository/g)).toHaveLength(20);
	});

	test.each([['not json {'], ['[1,2]'], ['{"name":42}'], ['null']])(
		'a package.json that says %s is skipped, siblings still read',
		async (text) => {
			const { ctx } = setup(
				reply(isA, { p0: { root: { text }, dirs: tree('bad', 'good') } }),
				reply(isB, {
					b0: { object: { text } },
					b1: { object: blob('@zorblax/good') },
				}),
			);
			const map = await repoPackages(ctx, ['softistx/zorblax-core']);
			expect(map.get('softistx/zorblax-core')).toEqual(['@zorblax/good']);
		},
	);

	test('a missing root and packages directory means it publishes nothing, cached', async () => {
		const { runner, ctx } = setup(
			reply(isA, { p0: { root: null, dirs: null } }),
		);
		expect(
			(await repoPackages(ctx, ['softistx/vexora-docs'])).get(
				'softistx/vexora-docs',
			),
		).toEqual([]);
		await repoPackages(ctx, ['softistx/vexora-docs']);
		expect(runner.calls).toHaveLength(1);
	});

	test('a null repository is not cached and is asked again', async () => {
		const { runner, ctx } = setup(
			reply(isA, { p0: { root: blob('acme'), dirs: null }, p1: null }, [
				{ path: ['p1'], message: 'Could not resolve to a Repository' },
			]),
		);
		const repos = ['softistx/acme-a', 'softistx/acme-b'];
		expect([...(await repoPackages(ctx, repos)).keys()]).toEqual([
			'softistx/acme-a',
		]);
		await repoPackages(ctx, repos);
		expect(runner.calls).toHaveLength(2);
		expect(queries(runner)[1]).not.toContain('acme-a');
	});

	test('an error under an alias (dirs null beside data) is not cached as a success', async () => {
		const { runner, ctx, at } = setup(
			reply(isA, { p0: { root: blob('acme'), dirs: null } }, [
				{ path: ['p0', 'dirs'], message: 'timeout' },
			]),
		);
		expect((await repoPackages(ctx, ['softistx/acme-a'])).size).toBe(0);
		await repoPackages(ctx, ['softistx/acme-a']);
		expect(runner.calls).toHaveLength(1); // failed entry, one hour
		at(NOW + FAILED_TTL_MS);
		await repoPackages(ctx, ['softistx/acme-a']);
		expect(runner.calls).toHaveLength(2);
	});

	test.each([
		'HTTP 502: Bad Gateway',
		'HTTP 403: Resource not accessible',
		'timeout',
	])(
		'a failed call (%s) is cached as failed for an hour and does not throw',
		async (stderr) => {
			const { runner, ctx, at } = setup(down(stderr));
			expect((await repoPackages(ctx, ['softistx/acme-a'])).size).toBe(0);
			await repoPackages(ctx, ['softistx/acme-a']);
			expect(runner.calls).toHaveLength(1);
			at(NOW + FAILED_TTL_MS - 1);
			await repoPackages(ctx, ['softistx/acme-a']);
			expect(runner.calls).toHaveLength(1);
			at(NOW + FAILED_TTL_MS);
			await repoPackages(ctx, ['softistx/acme-a']);
			expect(runner.calls).toHaveLength(2);
		},
	);

	test('one failing call B marks only its repositories failed', async () => {
		const { ctx } = setup(
			reply(isA, {
				p0: { root: blob('acme-a'), dirs: tree('x') },
				p1: { root: blob('acme-b'), dirs: null },
			}),
			down('HTTP 502: Bad Gateway', isB),
		);
		const map = await repoPackages(ctx, ['softistx/acme-a', 'softistx/acme-b']);
		expect([...map.keys()]).toEqual(['softistx/acme-b']);
	});

	test('a rate limit throws RateLimitedError', async () => {
		const { ctx } = setup(down('HTTP 429: API rate limit exceeded'));
		await expect(repoPackages(ctx, ['softistx/acme-a'])).rejects.toBeInstanceOf(
			RateLimitedError,
		);
	});

	test('a success is fresh for 24 hours, then read again', async () => {
		const { runner, ctx, at } = setup(
			reply(isA, { p0: { root: blob('acme'), dirs: null } }),
		);
		await repoPackages(ctx, ['softistx/acme-a']);
		at(NOW + PACKAGES_TTL_MS - 1);
		await repoPackages(ctx, ['softistx/acme-a']);
		expect(runner.calls).toHaveLength(1);
		at(NOW + PACKAGES_TTL_MS);
		await repoPackages(ctx, ['softistx/acme-a']);
		expect(runner.calls).toHaveLength(2);
	});

	test('asks for nothing for an empty list', async () => {
		const { runner, ctx } = setup();
		expect((await repoPackages(ctx, [])).size).toBe(0);
		expect(runner.calls).toHaveLength(0);
	});
});
