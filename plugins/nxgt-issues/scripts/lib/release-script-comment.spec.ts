/**
 * The release script posts the "Fixed in" comment, `context.ts` parses it and
 * `issue-body.ts` writes it for the session path. They share no code (the
 * script is copied where the plugin does not exist), so this spec runs the
 * script's real step and holds the three to one format.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeReleasedIssues } from '../release/close-released-issues';
import type { Exec } from '../release/close-released-issues-lib';
import { releaseFix } from './context';
import { fixedComment } from './issue-body';
import { removeTempDirs, tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });

/** What the script writes for `name@version` fixed by PR #40, taken from its `gh issue comment` call. */
async function scriptComment(name: string, version: string): Promise<string> {
	const dir = tempDir('release-comment');
	mkdirSync(join(dir, 'packages', 'zorblax'), { recursive: true });
	writeFileSync(
		join(dir, 'packages', 'zorblax', 'package.json'),
		JSON.stringify({ name, version }),
	);
	let posted = '';
	const exec: Exec = async (argv, stdin) => {
		const [tool, a, b] = argv;
		if (tool === 'git' && a === 'tag') return ok(`${name}@${version}\n`);
		if (tool === 'git' && a === 'log') return ok('');
		if (tool === 'git' && a === 'show') {
			return ok(
				`# ${name}\n\n## ${version}\n\n- [#40](https://x/pull/40) Thing.\n`,
			);
		}
		if (tool === 'git' && a === 'diff') return ok('packages/zorblax/src/a.ts');
		if (a === 'pr' && b === 'view') {
			return ok(
				JSON.stringify({
					number: 40,
					baseRefName: 'develop',
					headRefName: 'fix/x',
					body: '',
					closingIssuesReferences: [
						{
							number: 12,
							repository: { name: 'zorblax', owner: { login: 'acme' } },
						},
					],
					mergeCommit: null,
					mergedAt: null,
					files: [{ path: 'packages/zorblax/src/a.ts' }],
				}),
			);
		}
		if (a === 'issue' && b === 'view') {
			return ok(
				JSON.stringify({ body: '', state: 'OPEN', labels: [], comments: [] }),
			);
		}
		if (a === 'label' && b === 'list') return ok('[{"name":"released"}]');
		if (a === 'issue' && b === 'comment') posted = stdin ?? '';
		return ok();
	};
	await closeReleasedIssues(
		['--published', JSON.stringify([{ name, version }])],
		{ GITHUB_REPOSITORY: 'acme/zorblax' },
		exec,
		() => undefined,
		dir,
	);
	return posted;
}

describe('the release script and the plugin agree on the "Fixed in" comment', () => {
	for (const [name, version] of [
		['@acme/zorblax', '1.4.0'],
		['quillon', '2.0.0-rc.1'],
	] as const) {
		test(`${name}@${version}: byte-identical to fixedComment`, async () => {
			const posted = await scriptComment(name, version);
			expect(posted).not.toBe('');
			expect(posted).toBe(fixedComment(name, version, 40));
		});

		test(`${name}@${version}: parses as a fix under the release bot`, async () => {
			const posted = await scriptComment(name, version);
			const fix = releaseFix({
				lastComment: posted,
				lastCommentBy: 'NONE',
				lastCommentLogin: 'github-actions',
				lastCommentAuthorType: 'Bot',
			});
			expect(fix?.package).toBe(name);
			expect(fix?.version).toBe(version);
		});
	}
});
