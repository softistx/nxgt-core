import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callsOf, harness, makeApp } from './cli.fixtures';
import { findDenied } from './deny';
import { DenyListIncomplete, filingDenyList } from './deny-sources';
import { removeTempDirs, tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

describe('the deny-list sees every default owner', () => {
	test('NXGT_ISSUES_OWNERS narrowing the recipients still lists both owners', async () => {
		const h = harness({
			cwd: makeApp(),
			env: { NXGT_ISSUES_OWNERS: 'softistx' },
			run: [
				{
					argv: ['gh', 'repo', 'list', 'SteveGT96'],
					result: {
						stdout: JSON.stringify([
							{ nameWithOwner: 'SteveGT96/quiet-ledger' },
						]),
					},
				},
			],
		});
		const list = await filingDenyList(h.ctx);
		expect(findDenied('the quiet-ledger app', list)).toContain('quiet-ledger');
		expect(callsOf(h.runner, 'gh', 'repo', 'list', 'SteveGT96')).toHaveLength(
			1,
		);
	});

	test('an extra configured owner is listed too', async () => {
		const h = harness({
			cwd: makeApp(),
			env: { NXGT_ISSUES_OWNERS: 'softistx,acme-org' },
			run: [
				{ argv: ['gh', 'repo', 'list', 'acme-org'], result: { stdout: '[]' } },
			],
		});
		await filingDenyList(h.ctx);
		expect(
			callsOf(h.runner, 'gh', 'repo', 'list')
				.map((c) => c.argv[3])
				.sort(),
		).toEqual(['SteveGT96', 'acme-org', 'softistx']);
	});
});

describe('git config fails closed', () => {
	test('a spawn that throws refuses the filing', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [{ argv: ['git', 'config'], throws: 'spawn git ENOENT' }],
		});
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});

	test('exit 1 means unset', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [{ argv: ['git', 'config'], result: { code: 1 } }],
		});
		const list = await filingDenyList(h.ctx);
		expect(list.terms).not.toContain('Jane Roe');
	});

	test('another exit code refuses', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [
				{ argv: ['git', 'config'], result: { code: 128, stderr: 'fatal' } },
			],
		});
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});
});

describe('no GitHub origin', () => {
	test('the worktree root and the main checkout folder are denied', async () => {
		const base = tempDir('noorigin');
		const main = join(base, 'falcon-crm');
		const wt = join(base, 'falcon-feature');
		mkdirSync(join(main, '.git', 'worktrees', 'ff'), { recursive: true });
		writeFileSync(join(main, '.git', 'config'), '[core]\n\tbare = false\n');
		writeFileSync(
			join(main, '.git', 'worktrees', 'ff', 'commondir'),
			'../..\n',
		);
		mkdirSync(join(wt, 'src'), { recursive: true });
		writeFileSync(join(wt, '.nxgt-issues.json'), '{"appDomains":[]}');
		writeFileSync(
			join(wt, '.git'),
			`gitdir: ${join(main, '.git', 'worktrees', 'ff')}\n`,
		);
		const h = harness({ cwd: join(wt, 'src') });
		const list = await filingDenyList(h.ctx);
		expect(findDenied('in falcon-feature and falcon-crm', list).sort()).toEqual(
			['falcon-crm', 'falcon-feature'],
		);
	});
});
