import { describe, expect, test } from 'bun:test';
import { behindDependencies, isBehind } from './deps-behind';
import { fakeRunner } from './runner.fixtures';

describe('isBehind', () => {
	test.each([
		['^1.2.0', '1.9.0', false],
		['^1.2.0', '2.0.0', true],
		['^0.3.1', '0.3.9', false],
		['^0.3.1', '0.4.0', true],
		['^0.0.3', '0.0.4', true],
		['~1.2.0', '1.2.9', false],
		['~1.2.0', '1.3.0', true],
		['1.2.0', '1.2.1', true],
		['1.2.0', '1.2.0', false],
		['>=1.0.0', '9.0.0', false],
	])('%s with latest %s: %p', (range, latest, behind) => {
		expect(isBehind(range, latest)).toBe(behind);
	});

	test.each(['*', 'latest', 'workspace:^', '^1.0.0 || ^2.0.0', 'link:../x'])(
		'%p is not read',
		(range) => {
			expect(isBehind(range, '1.0.0')).toBeUndefined();
		},
	);
});

describe('behindDependencies', () => {
	test("lists what the package's latest manifest declares behind", async () => {
		const runner = fakeRunner({
			fetch: [
				{
					url: '/@nxgt%2Fwidget/latest',
					json: {
						dependencies: { zod: '^3.22.0', hono: '^4.0.0', gone: '^1.0.0' },
					},
				},
				{ url: '/zod/latest', json: { version: '4.1.0' } },
				{ url: '/hono/latest', json: { version: '4.6.0' } },
				{ url: '/gone/latest', throws: '404' },
			],
		});
		expect(await behindDependencies(runner, '@nxgt/widget')).toEqual([
			{ name: 'zod', current: '^3.22.0', latest: '4.1.0' },
		]);
	});
});
