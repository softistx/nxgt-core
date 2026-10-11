import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { harness, makeApp } from './cli.fixtures';
import { EXIT } from './cli-context';
import { sessionsCommand, usesOf } from './sessions';

const NOW = Date.parse('2026-10-10T12:00:00Z');

function withSessions(records: Record<string, unknown>[]) {
	const h = harness({ cwd: makeApp(), now: NOW });
	const dir = join(h.home, 'crew', 'sessions');
	mkdirSync(dir, { recursive: true });
	for (const r of records) {
		const record = {
			version: 1,
			lastSeen: new Date(NOW - 60_000).toISOString(),
			...r,
		};
		writeFileSync(join(dir, `${r['sessionId']}.json`), JSON.stringify(record));
	}
	return h;
}

describe('sessions', () => {
	test('lists the live sessions whose repository uses a package of the repo', () => {
		const app = makeApp();
		const h = withSessions([
			{
				sessionId: 'app',
				cwd: '/elsewhere',
				worktree: app,
				title: 'acme',
				branch: 'develop',
			},
			{
				sessionId: 'pkg',
				cwd: makeApp(),
				remote: 'git@github.com:softistx/nxgt-widget.git',
			},
			{ sessionId: 'other', cwd: '/nowhere' },
			{
				sessionId: 'stale',
				cwd: makeApp(),
				lastSeen: new Date(NOW - 3_600_000).toISOString(),
			},
		]);
		expect(sessionsCommand(h.ctx, 'softistx/nxgt-widget', false)).toBe(EXIT.ok);
		expect(h.out).toEqual([
			`app "acme" ${app} (develop) uses @nxgt/widget@^1.2.0`,
		]);
	});

	test('this session is left out', () => {
		const h = withSessions([{ sessionId: 'me', cwd: makeApp() }]);
		const ctx = { ...h.ctx, env: { ...h.ctx.env, NXGT_CREW_SESSION_ID: 'me' } };
		sessionsCommand(ctx, 'softistx/nxgt-widget', false);
		expect(h.out).toEqual(['no live session depends on softistx/nxgt-widget']);
	});

	test('no registry at all is no session, not an error', () => {
		const h = harness({ cwd: makeApp() });
		expect(sessionsCommand(h.ctx, 'softistx/nxgt-widget', false)).toBe(EXIT.ok);
		expect(h.out[0]).toContain('no live session');
	});

	test('--json prints the consumers', () => {
		const h = withSessions([{ sessionId: 'app', cwd: makeApp() }]);
		sessionsCommand(h.ctx, 'softistx/nxgt-widget', true);
		const parsed = JSON.parse(h.out.join('\n'));
		expect(parsed[0].session.sessionId).toBe('app');
		expect(parsed[0].uses).toEqual(['@nxgt/widget@^1.2.0']);
	});

	test.each([undefined, 'widget'])('target %p is a usage error', (target) => {
		const h = harness({ cwd: makeApp() });
		expect(sessionsCommand(h.ctx, target, false)).toBe(EXIT.usage);
	});

	test('a workspace dependency counts, matched through its installed repository', () => {
		const app = makeApp();
		writeFileSync(
			join(app, 'apps', 'web', 'package.json'),
			JSON.stringify({
				name: '@acme/web',
				devDependencies: { '@nxgt/gadget': '^2.0.0' },
			}),
		);
		const installed = join(app, 'node_modules', '@nxgt', 'gadget');
		mkdirSync(installed, { recursive: true });
		writeFileSync(
			join(installed, 'package.json'),
			JSON.stringify({ repository: 'softistx/nxgt-widget' }),
		);
		expect(usesOf(app, { owner: 'softistx', repo: 'nxgt-widget' })).toEqual([
			'@nxgt/gadget@^2.0.0',
			'@nxgt/widget@^1.2.0',
		]);
	});
});
