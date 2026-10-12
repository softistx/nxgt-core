import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeTempDirs, tempDir } from './temp.fixtures';
import { fromNodeModules, manifestsOf, PACKAGE_NAME } from './workspaces';

afterAll(removeTempDirs);

function repo(files: Record<string, unknown>): string {
	const root = tempDir('ws');
	for (const [path, data] of Object.entries(files)) {
		mkdirSync(join(root, path, '..'), { recursive: true });
		writeFileSync(
			join(root, path),
			typeof data === 'string' ? data : JSON.stringify(data),
		);
	}
	return root;
}

const names = (root: string, strict = true) =>
	manifestsOf(root, { strict })
		.map((m) => m.name)
		.sort();

describe('manifestsOf', () => {
	test('expands nested and ** patterns, never into node_modules', () => {
		const root = repo({
			'package.json': {
				name: 'root',
				workspaces: ['apps/*/web', 'libs/**', 'plain'],
			},
			'apps/one/web/package.json': { name: 'one-web' },
			'apps/two/api/package.json': { name: 'not-matched' },
			'libs/a/package.json': { name: 'lib-a' },
			'libs/deep/b/package.json': { name: 'lib-b' },
			'libs/a/node_modules/dep/package.json': { name: 'installed' },
			'plain/package.json': { name: 'plain-one' },
		});
		expect(names(root)).toEqual([
			'lib-a',
			'lib-b',
			'one-web',
			'plain-one',
			'root',
		]);
	});

	test('reads the packages of pnpm-workspace.yaml', () => {
		const root = repo({
			'package.json': { name: 'root' },
			'pnpm-workspace.yaml': 'packages:\n  - \'pkgs/*\'\n  - "tools/**"\n',
			'pkgs/x/package.json': { name: 'pkg-x' },
			'tools/y/z/package.json': { name: 'tool-z' },
		});
		expect(names(root)).toEqual(['pkg-x', 'root', 'tool-z']);
	});

	test('a pattern it cannot expand refuses in strict mode', () => {
		for (const pattern of ['../shared/*', '/abs/*']) {
			const root = repo({
				'package.json': { name: 'r', workspaces: [pattern] },
			});
			expect(() => manifestsOf(root, { strict: true })).toThrow(pattern);
		}
		const root = repo({
			'package.json': { name: 'r' },
			'pnpm-workspace.yaml': 'packages: [unterminated',
		});
		expect(() => manifestsOf(root, { strict: true })).toThrow(
			'pnpm-workspace.yaml',
		);
	});

	test('a manifest that does not parse refuses in strict mode', () => {
		const matched = repo({
			'package.json': { name: 'r', workspaces: ['apps/*'] },
			'apps/a/package.json': '{ not json',
		});
		expect(() => manifestsOf(matched, { strict: true })).toThrow('apps/a');
		const root = repo({ 'package.json': '{ not json' });
		expect(() => manifestsOf(root, { strict: true })).toThrow('package.json');
		expect(manifestsOf(matched)).toHaveLength(1);
	});

	test('outside strict mode an unexpandable pattern is skipped as before', () => {
		const root = repo({
			'package.json': { name: 'r', workspaces: ['../x/*'] },
		});
		expect(names(root, false)).toEqual(['r']);
	});
});

describe('PACKAGE_NAME', () => {
	test('accepts the names npm accepts, a scoped leading underscore included', () => {
		for (const name of [
			'@nxgt/x',
			'lodash.merge',
			'a-b',
			'a~b',
			'socket.io',
			'@scope/_x',
		])
			expect(PACKAGE_NAME.test(name)).toBe(true);
	});

	test('refuses anything that could leave node_modules', () => {
		for (const name of [
			'..',
			'../x',
			'@a/../x',
			'@a/..',
			'@a/.x',
			'a/b',
			'@a/b/c',
			'/etc',
			'',
		])
			expect(PACKAGE_NAME.test(name)).toBe(false);
	});
});

describe('fromNodeModules', () => {
	test('reads an installed package, scoped or not', () => {
		const root = repo({
			'node_modules/@acme/widget/package.json': { version: '1.0.0' },
			'node_modules/zorblax/package.json': { version: '2.0.0' },
		});
		expect(fromNodeModules(root, '@acme/widget')?.version).toBe('1.0.0');
		expect(fromNodeModules(root, 'zorblax')?.version).toBe('2.0.0');
	});

	test('a name that is a path returns undefined even when the file exists', () => {
		const root = repo({
			'a/b/package.json': { name: 'inside' },
			'x/package.json': { name: 'planted', repository: 'acme/planted' },
			'a/node_modules/.keep/package.json': {},
		});
		const dir = join(root, 'a', 'b');
		expect(fromNodeModules(dir, '../x')).toBeUndefined();
		expect(fromNodeModules(dir, '../../../x')).toBeUndefined();
		expect(fromNodeModules(dir, '@acme/../../x')).toBeUndefined();
		expect(fromNodeModules(dir, '/etc')).toBeUndefined();
		expect(fromNodeModules(dir, '')).toBeUndefined();
	});
});
