import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, PKG, removeTempDirs } from './cli.fixtures';
import { buildDenyList } from './deny';
import { allowFor } from './filing';
import type { Resolved } from './resolve';
import { scrub } from './scrub';

afterAll(removeTempDirs);

const resolved: Resolved = {
	ok: true,
	package: PKG,
	repo: { owner: 'softistx', repo: 'nxgt-widget' },
	private: false,
};
const denyList = buildDenyList({ privateRepos: ['acme/zorblax-sdk'] });
const TEXTS = [
	'Versions: zorblax-sdk 1.2.0',
	'at verifySession (node_modules/zorblax-sdk/dist/x.js:40:11)',
];

const appPeering = (field: string | undefined) => {
	const app = makeApp();
	const manifest = join(app, 'node_modules', PKG, 'package.json');
	mkdirSync(join(app, 'node_modules', PKG), { recursive: true });
	writeFileSync(
		manifest,
		JSON.stringify({
			name: PKG,
			version: '1.3.0',
			...(field ? { [field]: { 'zorblax-sdk': '^1.0.0' } } : {}),
		}),
	);
	return app;
};

describe('packages the reported package installs are public', () => {
	test.each(['peerDependencies', 'dependencies', 'optionalDependencies'])(
		'declared in %s: allowed',
		(field) => {
			const cwd = appPeering(field);
			for (const text of TEXTS) {
				const result = scrub(text, {
					cwd,
					denyList,
					allow: allowFor(resolved, cwd),
				});
				expect({ text, denied: result.denied }).toEqual({ text, denied: [] });
			}
		},
	);

	test('not declared: refused', () => {
		const cwd = appPeering(undefined);
		for (const text of TEXTS) {
			expect(
				scrub(text, { cwd, denyList, allow: allowFor(resolved, cwd) }).refused,
			).toBe(true);
		}
	});

	test('the owner/name form stays denied', () => {
		const cwd = appPeering('peerDependencies');
		const result = scrub('see acme/zorblax-sdk', {
			cwd,
			denyList,
			allow: allowFor(resolved, cwd),
		});
		expect(result.denied).toContain('acme/zorblax-sdk');
	});
});
