import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { harness, makeApp, removeTempDirs } from './cli.fixtures';
import { findDenied } from './deny';
import { DenyListIncomplete, filingDenyList } from './deny-sources';

afterAll(removeTempDirs);

const noRepoFile = () => {
	const app = makeApp();
	rmSync(join(app, '.nxgt-issues.json'));
	return app;
};

describe('only real hosts count as configured domains', () => {
	test('NXGT_ISSUES_APP_DOMAINS=none refuses', async () => {
		const h = harness({
			cwd: noRepoFile(),
			env: { NXGT_ISSUES_APP_DOMAINS: 'none' },
		});
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});

	test('the user config ["none"] refuses', async () => {
		const h = harness({ cwd: noRepoFile() });
		mkdirSync(h.home, { recursive: true });
		writeFileSync(
			join(h.home, 'config.json'),
			JSON.stringify({ appDomains: ['none'] }),
		);
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});

	test("the user config's [] does not say the app has none", async () => {
		const h = harness({ cwd: noRepoFile() });
		mkdirSync(h.home, { recursive: true });
		writeFileSync(
			join(h.home, 'config.json'),
			JSON.stringify({ appDomains: [] }),
		);
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});

	test('a dotted domain counts', async () => {
		const h = harness({
			cwd: noRepoFile(),
			env: { NXGT_ISSUES_APP_DOMAINS: 'acme.io' },
		});
		expect((await filingDenyList(h.ctx)).terms).toContain('acme.io');
	});
});

describe('private repository stems', () => {
	const withRepos = (names: string[]) =>
		harness({
			cwd: makeApp(),
			run: [
				{
					argv: ['gh', 'repo', 'list', 'softistx'],
					result: {
						stdout: JSON.stringify(
							names.map((n) => ({ nameWithOwner: `softistx/${n}` })),
						),
					},
				},
			],
		});

	test('a product name in prose refuses', async () => {
		const list = await filingDenyList(withRepos(['sellix-monorepo']).ctx);
		expect(findDenied('this broke in Sellix yesterday', list)).toEqual([
			'sellix',
		]);
	});

	test('generic and common stems are not denied', async () => {
		const list = await filingDenyList(
			withRepos(['notes-api', 'demo-app', 'dotfiles', 'test-project']).ctx,
		);
		expect(findDenied('the api notes, a demo and a test', list)).toEqual([]);
		expect(findDenied('notes-api', list)).toEqual(['notes-api']);
	});
});
