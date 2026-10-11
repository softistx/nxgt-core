import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeTempDirs, tempDir } from './temp.fixtures';
import { manifestsOf } from './workspaces';

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

	test('outside strict mode an unexpandable pattern is skipped as before', () => {
		const root = repo({
			'package.json': { name: 'r', workspaces: ['../x/*'] },
		});
		expect(names(root, false)).toEqual(['r']);
	});
});
