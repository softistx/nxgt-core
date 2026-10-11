/**
 * A throwaway application checkout and a `CliContext` around the fake runner,
 * for the command specs. The application is `softistx/acme-store`, it installs
 * `@nxgt/widget` from `softistx/nxgt-widget`, and the person is Jane Roe.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliContext } from './cli-context';
import {
	type FakeRunner,
	type FetchRule,
	fakeRunner,
	type RunRule,
} from './runner.fixtures';

export const PKG = '@nxgt/widget';
export const WIDGET = { owner: 'softistx', repo: 'nxgt-widget' } as const;

const write = (path: string, data: unknown) => {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data));
};

/** A checkout of `origin` with a workspace and `@nxgt/widget` installed. */
export function makeApp(origin = 'git@github.com:softistx/acme-store.git') {
	const root = mkdtempSync(join(tmpdir(), 'nxgt-issues-app-'));
	const dir = join(root, 'acme-store');
	write(join(dir, '.git', 'config'), `[remote "origin"]\n\turl = ${origin}\n`);
	write(join(dir, 'package.json'), {
		name: 'acme-store',
		workspaces: ['apps/*'],
		dependencies: { [PKG]: '^1.2.0' },
	});
	write(join(dir, 'apps', 'web', 'package.json'), { name: '@acme/web' });
	write(join(dir, 'node_modules', PKG, 'package.json'), {
		name: PKG,
		version: '1.3.0',
		repository: { url: 'git+https://github.com/softistx/nxgt-widget.git' },
	});
	return dir;
}

export const repoJson = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		full_name: 'softistx/nxgt-widget',
		has_issues: true,
		archived: false,
		private: false,
		...over,
	});

/** The answers every filing needs; specs put their own rules first. */
export const BASE_RUN: readonly RunRule[] = [
	{
		argv: ['gh', 'api', 'repos/softistx/nxgt-widget'],
		result: { stdout: repoJson() },
	},
	{
		argv: ['gh', 'repo', 'list', 'softistx'],
		result: {
			stdout: JSON.stringify([{ nameWithOwner: 'softistx/secret-crm' }]),
		},
	},
	{ argv: ['gh', 'repo', 'list', 'SteveGT96'], result: { stdout: '[]' } },
	{
		argv: ['git', 'config', '--get', 'user.name'],
		result: { stdout: 'Jane Roe\n' },
	},
	{
		argv: ['git', 'config', '--get', 'user.email'],
		result: { stdout: 'jane@roe.example\n' },
	},
	{ argv: ['gh', 'issue', 'list', '--state', 'all'], result: { stdout: '[]' } },
	{
		argv: ['gh', 'issue', 'list', '--state', 'open'],
		result: { stdout: '[]' },
	},
	{
		argv: ['gh', 'label', 'list'],
		result: { stdout: JSON.stringify([{ name: 'bug' }]) },
	},
	{ argv: ['gh', 'label', 'create'] },
	{
		argv: ['gh', 'issue', 'create'],
		result: { stdout: 'https://github.com/softistx/nxgt-widget/issues/12\n' },
	},
	{
		argv: ['gh', 'issue', 'comment'],
		result: {
			stdout:
				'https://github.com/softistx/nxgt-widget/issues/7#issuecomment-1\n',
		},
	},
	{ argv: ['gh', 'issue', 'edit'] },
	{ argv: ['gh', 'issue', 'reopen'] },
];

export const BASE_FETCH: readonly FetchRule[] = [
	{
		url: '/@nxgt%2Fwidget/latest',
		json: { version: '1.4.0', repository: 'github:softistx/nxgt-widget' },
	},
];

export interface Harness {
	readonly ctx: CliContext;
	readonly runner: FakeRunner;
	readonly out: string[];
	readonly err: string[];
	readonly home: string;
}

export function harness(options: {
	cwd: string;
	run?: readonly RunRule[];
	fetch?: readonly FetchRule[];
	stdin?: string;
	env?: Record<string, string | undefined>;
	now?: number;
}): Harness {
	const runner = fakeRunner({
		run: [...(options.run ?? []), ...BASE_RUN],
		fetch: [...(options.fetch ?? []), ...BASE_FETCH],
	});
	const home = mkdtempSync(join(tmpdir(), 'nxgt-issues-home-'));
	const out: string[] = [];
	const err: string[] = [];
	const ctx: CliContext = {
		runner,
		env: { NXGT_CREW_HOME: join(home, 'crew'), ...options.env },
		cwd: options.cwd,
		home,
		now: () => options.now ?? Date.parse('2026-10-10T12:00:00Z'),
		hostname: 'janes-laptop.local',
		homeDir: '/Users/jroe',
		stdin: async () => options.stdin ?? '',
		out: (line) => out.push(line),
		err: (line) => err.push(line),
		probe: () => undefined,
	};
	return { ctx, runner, out, err, home };
}

/** The argv of every call that starts with these words. */
export const callsOf = (runner: FakeRunner, ...words: string[]) =>
	runner.calls.filter((call) => words.every((w, i) => call.argv[i] === w));

/** A valid bug report; override fields per spec. */
export const report = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		package: PKG,
		kind: 'bug',
		title: 'parse() drops the last item of a list',
		symptom: 'parse drops the last item of a list',
		summary: 'Parsing a list loses its final element.',
		versions: { [PKG]: '1.3.0', bun: '1.3.2' },
		expected: '`parse("a,b")` returns `["a", "b"]`.',
		actual: 'It returns `["a"]`.',
		repro:
			'```ts\nimport { parse } from "@nxgt/widget";\nconsole.log(parse("a,b"));\n```',
		workaround: 'Append a trailing comma.',
		keywords: ['parse', 'last', 'item'],
		...over,
	});
