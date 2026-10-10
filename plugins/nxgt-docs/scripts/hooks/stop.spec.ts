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

	test('workspace packages under lib/ and a package named test are checked', async () => {
		write('package.json', {
			name: 'root',
			private: true,
			workspaces: ['packages/*', 'lib/*'],
		});
		write('lib/inner/package.json', { ...PUB, name: '@x/inner' });
		write('lib/inner/src/index.ts', 'export {}');
		write('packages/test/package.json', { ...PUB, name: '@x/test' });
		write('packages/test/src/index.ts', 'export {}');
		await commit();
		await $`git -C ${repo} update-ref refs/remotes/origin/develop HEAD`.quiet();
		write('lib/inner/src/index.ts', 'export const a = 1;');
		write('packages/test/src/index.ts', 'export const a = 1;');
		const { out } = await stop();
		expect(out?.decision).toBe('block');
		expect(out?.reason).toContain('@x/inner');
		expect(out?.reason).toContain('@x/test');
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

	test('a docs/ page changed with it: silent', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		write('packages/pub/docs/guide.md', '# guide\n\n## a');
		expect(await stop()).toEqual(silent);
	});

	test('a docs-only change: silent', async () => {
		write('packages/pub/docs/guide.md', '# guide\n\nmore');
		write('packages/pub/docs/new.md', '# new');
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

	test('a package is reported once per session; only a newly gapped package blocks again', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		const first = await stop();
		expect(first.out?.decision).toBe('block');
		expect(first.out?.reason).toContain(
			'will not ask again for this package in this session',
		);
		expect(await stop()).toEqual(silent);
		expect((await stop({ session_id: 'other' })).out?.decision).toBe('block');
		write('packages/pub/src/b.ts', 'export {}');
		expect(await stop()).toEqual(silent);
		write('packages/two/package.json', { ...PUB, name: '@x/two' });
		await commit();
		write('packages/two/src/index.ts', 'export {}');
		const second = await stop();
		expect(second.out?.decision).toBe('block');
		expect(second.out?.reason).toContain('@x/two');
		expect(second.out?.reason).not.toContain('@x/pub');
	});

	test('a committed rename out of src/ blocks on the old path', async () => {
		await $`git -C ${repo} mv packages/pub/src/index.ts packages/pub/tools.ts`.quiet();
		await commit();
		const { out } = await stop();
		expect(out?.decision).toBe('block');
		expect(out?.reason).toContain('src/index.ts');
	});

	test('a lower-case readme.md closes the gap', async () => {
		write('packages/pub/src/index.ts', 'export const a = 1;');
		write('packages/pub/readme.md', '# pub\n\n## a');
		expect(await stop()).toEqual(silent);
	});

	test('a package.json under test fixtures is no package', async () => {
		write('packages/pub/test/fixtures/mod/package.json', { name: 'mod' });
		write('packages/pub/test/fixtures/mod/src/index.ts', 'export {}');
		write('packages/pub/src/__tests__/x/package.json', { name: 'x' });
		write('packages/pub/src/__tests__/x/lib/a.ts', 'export {}');
		expect(await stop()).toEqual(silent);
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

	describe('edits outside the working directory', () => {
		const edit = (file: string, extra: Record<string, unknown> = {}) =>
			JSON.stringify({
				type: 'assistant',
				...extra,
				message: {
					content: [
						{
							type: 'tool_use',
							id: `e-${file}`,
							name: 'Edit',
							input: { file_path: file, old_string: 'a', new_string: 'b' },
						},
					],
				},
			});

		/** A linked worktree of the scratch repository, on its own branch. */
		async function worktree() {
			const path = join(scratch, `wt-${n}`);
			await $`git -C ${repo} worktree add -q -b wt-${n} ${path}`.quiet();
			return path;
		}

		function transcript(...entries: string[]) {
			const path = join(scratch, `edits-${n}.jsonl`);
			writeFileSync(path, entries.join('\n'));
			return path;
		}

		test('an Edit in a linked worktree blocks while cwd is the main checkout', async () => {
			const wt = await worktree();
			const file = join(wt, 'packages/pub/src/index.ts');
			writeFileSync(file, 'export const a = 1;');
			const { out } = await stop({ transcript_path: transcript(edit(file)) });
			expect(out?.decision).toBe('block');
			expect(out?.reason).toContain('@x/pub');
			expect(out?.reason).toContain(join(wt, 'packages/pub/README.md'));
			expect(await stop({ transcript_path: transcript(edit(file)) })).toEqual(
				silent,
			);
		});

		test('the same package in the main checkout and a worktree is reported for each', async () => {
			const wt = await worktree();
			const file = join(wt, 'packages/pub/src/index.ts');
			writeFileSync(file, 'export const a = 1;');
			write('packages/pub/src/index.ts', 'export const b = 1;');
			const { out } = await stop({ transcript_path: transcript(edit(file)) });
			expect(out?.reason).toContain(join(repo, 'packages/pub/README.md'));
			expect(out?.reason).toContain(join(wt, 'packages/pub/README.md'));
		});

		test('a file_path outside any repository is ignored', async () => {
			const outside = join(scratch, `loose-${n}`, 'note.ts');
			mkdirSync(dirname(outside), { recursive: true });
			writeFileSync(outside, 'x');
			const path = transcript(
				edit(outside),
				edit(join(scratch, 'gone', 'deeper', 'missing.ts')),
			);
			expect(await stop({ transcript_path: path })).toEqual(silent);
		});

		test('a sidechain edit is ignored', async () => {
			const wt = await worktree();
			const file = join(wt, 'packages/pub/src/index.ts');
			writeFileSync(file, 'export const a = 1;');
			const path = transcript(edit(file, { isSidechain: true }));
			expect(await stop({ transcript_path: path })).toEqual(silent);
		});
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
