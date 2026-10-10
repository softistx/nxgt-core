/**
 * The Stop hook end to end: spawned the way Claude Code spawns it, with the
 * event on stdin, against a git repository in a temporary folder whose
 * `origin/develop` is the commit the branch started from.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';

const SCRIPT = join(import.meta.dir, 'stop.ts');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'nxgt-docs-spec-')));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
let repo = '';
let state = '';

function write(path: string, content: unknown) {
	const file = join(repo, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(
		file,
		typeof content === 'string' ? content : JSON.stringify(content, null, '\t'),
	);
}

const PUB = {
	name: '@x/pub',
	version: '1.0.0',
	exports: { '.': './dist/index.js' },
	files: ['dist'],
};

/** A monorepo: a private root, a published package and a private one. */
async function monorepo(published = true) {
	n++;
	repo = join(scratch, `repo-${n}`);
	state = join(scratch, `state-${n}`);
	mkdirSync(repo);
	write('package.json', {
		name: 'root',
		private: true,
		workspaces: ['packages/*'],
	});
	write('scripts/x.ts', 'x');
	write('packages/priv/package.json', { name: '@x/priv', private: true });
	write('packages/priv/src/a.ts', 'a');
	if (published) {
		write('packages/pub/package.json', PUB);
		write('packages/pub/src/index.ts', 'export {}');
		write('packages/pub/README.md', '# pub');
		mkdirSync(join(repo, 'packages/pub/docs'));
		write('packages/pub/docs/guide.md', '# guide');
	}
	await $`git init -q -b feat ${repo} && git -C ${repo} add -A && git -C ${repo} -c user.email=t@t -c user.name=t commit -q -m init && git -C ${repo} update-ref refs/remotes/origin/develop HEAD`.quiet();
}

const commit = () =>
	$`git -C ${repo} add -A && git -C ${repo} -c user.email=t@t -c user.name=t commit -q -m change`.quiet();

async function stop(
	input: Record<string, unknown> | string = {},
	env: Record<string, string> = {},
) {
	const body =
		typeof input === 'string'
			? input
			: JSON.stringify({
					session_id: `s-${n}`,
					cwd: repo,
					hook_event_name: 'Stop',
					stop_hook_active: false,
					...input,
				});
	const proc = Bun.spawn(['bun', SCRIPT], {
		stdin: new Blob([body]),
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...process.env,
			NXGT_DOCS_DISABLE: '',
			NXGT_DOCS_STATE_DIR: state,
			...env,
		},
	});
	const text = (await new Response(proc.stdout).text()).trim();
	return { code: await proc.exited, out: text ? JSON.parse(text) : undefined };
}

const silent = { code: 0, out: undefined };

beforeEach(() => monorepo());

describe('stop.ts', () => {
	test('no published package in the repository: silent', async () => {
		await monorepo(false);
		write('scripts/x.ts', 'y');
		write('src/index.ts', 'z');
		expect(await stop()).toEqual(silent);
	});

	test('a change in a private package only: silent', async () => {
		write('packages/priv/src/a.ts', 'b');
		write('packages/priv/src/new.ts', 'c');
		expect(await stop()).toEqual(silent);
	});

	test('a committed src change without the README blocks, naming what is missing', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		await commit();
		const { code, out } = await stop();
		expect(code).toBe(0);
		expect(out.decision).toBe('block');
		expect(out.reason).toContain('@x/pub');
		expect(out.reason).toContain('src/index.ts');
		expect(out.reason).toContain('packages/pub/README.md');
		expect(out.reason).toContain('docs/ guide');
		expect(out.reason).toContain('keep-docs-current');
		expect(out.reason).toContain('not consumer-visible');
	});

	test('an untracked src file counts too', async () => {
		write('packages/pub/src/new.ts', 'export {}');
		expect((await stop()).out?.decision).toBe('block');
	});

	test('the README changed with it: silent', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		write('packages/pub/README.md', '# pub\n\n## a');
		expect(await stop()).toEqual(silent);
	});

	test('a spec-only change: silent', async () => {
		write('packages/pub/src/index.spec.ts', 'test');
		expect(await stop()).toEqual(silent);
	});

	test('package.json: an exports change blocks, a version change does not', async () => {
		write('packages/pub/package.json', { ...PUB, version: '1.1.0' });
		expect(await stop()).toEqual(silent);
		write('packages/pub/package.json', {
			...PUB,
			exports: { ...PUB.exports, './a': './dist/a.js' },
		});
		const { out } = await stop();
		expect(out.decision).toBe('block');
		expect(out.reason).toContain('package.json');
	});

	test('the same gap is reported once per session; a new file reports again', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		expect((await stop()).out?.decision).toBe('block');
		expect(await stop()).toEqual(silent);
		expect((await stop({ session_id: 'other' })).out?.decision).toBe('block');
		write('packages/pub/src/b.ts', 'export {}');
		expect((await stop()).out?.decision).toBe('block');
	});

	test('a pending documentation-auditor run: silent', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		const transcript = join(scratch, `t-${n}.jsonl`);
		writeFileSync(
			transcript,
			[
				JSON.stringify({
					type: 'assistant',
					message: {
						content: [
							{
								type: 'tool_use',
								id: 'tu1',
								name: 'Agent',
								input: { subagent_type: 'nxgt-docs:documentation-auditor' },
							},
						],
					},
				}),
				JSON.stringify({
					type: 'user',
					message: {
						content: [
							{
								type: 'tool_result',
								tool_use_id: 'tu1',
								content: 'Async agent launched successfully.',
							},
						],
					},
					toolUseResult: { isAsync: true, status: 'async_launched' },
				}),
			].join('\n'),
		);
		expect(await stop({ transcript_path: transcript })).toEqual(silent);
		expect(
			(await stop({ transcript_path: join(scratch, 'missing.jsonl') })).out
				?.decision,
		).toBe('block');
	});

	test('stop_hook_active: silent', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		expect(await stop({ stop_hook_active: true })).toEqual(silent);
	});

	test('NXGT_DOCS_DISABLE=1: silent', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		expect(await stop({}, { NXGT_DOCS_DISABLE: '1' })).toEqual(silent);
	});

	test('malformed stdin, no session or no repository: silent', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		expect(await stop('not json')).toEqual(silent);
		expect(await stop({ session_id: undefined })).toEqual(silent);
		expect(await stop({ cwd: scratch })).toEqual(silent);
	});
});
