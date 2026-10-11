import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callsOf, harness, makeApp, removeTempDirs } from './cli.fixtures';

afterAll(removeTempDirs);

import { findDenied } from './deny';
import {
	DenyListIncomplete,
	filingDenyList,
	PRIVATE_REPOS_TTL_MS,
	readDenyConfig,
} from './deny-sources';

const NOW = Date.parse('2026-10-10T12:00:00Z');

describe('readDenyConfig', () => {
	test('env, the user-wide file and the repository file are merged', () => {
		const app = makeApp();
		const h = harness({
			cwd: app,
			env: {
				NXGT_ISSUES_APP_DOMAINS: 'shop.acme.io, ',
				NXGT_ISSUES_DENY_TERMS: 'gizmo',
			},
		});
		mkdirSync(h.home, { recursive: true });
		writeFileSync(
			join(h.home, 'config.json'),
			JSON.stringify({ denyTerms: ['Project Falcon'] }),
		);
		writeFileSync(
			join(app, '.nxgt-issues.json'),
			JSON.stringify({ appDomains: ['acme-pay.com'], denyTerms: [3] }),
		);
		expect(readDenyConfig(h.ctx, app)).toEqual({
			appDomains: ['shop.acme.io', 'acme-pay.com'],
			denyTerms: ['gizmo', 'Project Falcon'],
		});
	});

	test('a missing or broken file is empty', () => {
		const app = makeApp();
		writeFileSync(join(app, '.nxgt-issues.json'), '{');
		expect(readDenyConfig(harness({ cwd: app }).ctx, app)).toEqual({
			appDomains: [],
			denyTerms: [],
		});
	});
});

describe('filingDenyList', () => {
	test('gathers every source', async () => {
		const app = makeApp();
		writeFileSync(
			join(app, '.nxgt-issues.json'),
			JSON.stringify({ appDomains: ['api.acmepay.io'], denyTerms: ['Falcon'] }),
		);
		const h = harness({ cwd: app });
		const list = await filingDenyList(h.ctx);
		for (const text of [
			'softistx/acme-store',
			'acme-store',
			'@acme/web',
			'secret-crm',
			'Jane Roe',
			'jane@roe.example',
			'janes-laptop',
			'/Users/jroe',
			'acmepay',
			'Falcon',
		]) {
			expect({ text, hit: findDenied(`x ${text} y`, list).length > 0 }).toEqual(
				{ text, hit: true },
			);
		}
	});

	test('the private-repository list is cached for 24 hours', async () => {
		const cwd = makeApp();
		const h = harness({ cwd, now: NOW });
		await filingDenyList(h.ctx);
		await filingDenyList({
			...h.ctx,
			now: () => NOW + PRIVATE_REPOS_TTL_MS - 1,
		});
		expect(callsOf(h.runner, 'gh', 'repo', 'list')).toHaveLength(2); // one per owner, once
	});

	test('gh failing: the stale list is used; without one, no filing', async () => {
		const cwd = makeApp();
		const ok = harness({ cwd, now: NOW });
		await filingDenyList(ok.ctx);
		const failing = harness({
			cwd,
			now: NOW + 2 * PRIVATE_REPOS_TTL_MS,
			run: [
				{
					argv: ['gh', 'repo', 'list'],
					result: { code: 1, stderr: 'offline' },
				},
			],
		});
		const stale = { ...failing.ctx, home: ok.home };
		expect(findDenied('secret-crm', await filingDenyList(stale))).toEqual([
			'secret-crm',
		]);
		await expect(filingDenyList(failing.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});
});
