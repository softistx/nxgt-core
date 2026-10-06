import { describe, expect, test } from 'bun:test';
import { accessProblems, manifestShapeProblems } from './manifest';

describe('manifestShapeProblems', () => {
	const mongo = { name: '@nxgt/shared-mongo', version: '1.1.0' };
	const hono = (dependencies: Record<string, string>) => ({
		name: '@nxgt/shared-hono',
		version: '1.0.2',
		dependencies,
	});

	test('accepts a caret range on a sibling that includes it', () => {
		expect(
			manifestShapeProblems([mongo, hono({ '@nxgt/shared-mongo': '^1.0.0' })]),
		).toEqual([]);
	});

	test('refuses an exact pin on a sibling: two copies, OverwriteModelError', () => {
		expect(
			manifestShapeProblems([mongo, hono({ '@nxgt/shared-mongo': '1.1.0' })]),
		).toEqual([expect.stringContaining('pins a sibling exactly')]);
	});

	test('refuses a workspace: left in a field a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{
					name: '@nxgt/shared-mongo',
					dependencies: { a: 'workspace:^' },
					devDependencies: { b: 'workspace:*' },
				},
			]),
		).toEqual([expect.stringContaining('dependencies.a = workspace:^')]);
	});

	test('refuses a package that lists itself', () => {
		expect(
			manifestShapeProblems([
				{ ...mongo, dependencies: { '@nxgt/shared-mongo': '.' } },
			]),
		).toEqual([expect.stringContaining('lists itself')]);
	});

	test('refuses link: and file: where a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{
					name: '@nxgt/shared-mongo',
					dependencies: { a: 'link:../a' },
					optionalDependencies: { b: 'file:../b' },
					devDependencies: { c: 'link:../c' },
				},
			]),
		).toEqual([
			'@nxgt/shared-mongo: dependencies.a = link:../a',
			'@nxgt/shared-mongo: optionalDependencies.b = file:../b',
		]);
	});
});

describe('accessProblems', () => {
	test('accepts a scoped package published as public', () => {
		expect(
			accessProblems({
				name: '@nxgt/httpyz',
				publishConfig: { access: 'public' },
			}),
		).toEqual([]);
	});

	test('passes an unscoped package, which npm publishes as public', () => {
		expect(accessProblems({ name: 'nxgt-tool' })).toEqual([]);
	});

	test('refuses a scoped package published as restricted', () => {
		expect(
			accessProblems({
				name: '@nxgt/httpyz',
				publishConfig: { access: 'restricted' },
			}),
		).toHaveLength(1);
	});

	test('refuses a scoped package with no publishConfig', () => {
		expect(accessProblems({ name: '@nxgt/httpyz' })).toEqual([
			'@nxgt/httpyz: publishConfig.access is not "public"; bun publish would publish this scoped package as restricted',
		]);
	});
});
