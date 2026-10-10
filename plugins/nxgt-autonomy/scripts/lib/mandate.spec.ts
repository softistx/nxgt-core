import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMandate, disabled, insideGitRepo } from './mandate';

describe('disabled', () => {
	test.each(['1', 'true', 'TRUE', ' 1 '])(
		'NXGT_AUTONOMY_DISABLE=%p opts out',
		(value) => {
			expect(disabled({ NXGT_AUTONOMY_DISABLE: value })).toBe(true);
		},
	);

	test.each([undefined, '', '0', 'false', 'no', 'yes'])(
		'NXGT_AUTONOMY_DISABLE=%p keeps the mandate on',
		(value) => {
			expect(disabled({ NXGT_AUTONOMY_DISABLE: value })).toBe(false);
		},
	);
});

describe('insideGitRepo', () => {
	const at =
		(...paths: string[]) =>
		(path: string) =>
			paths.includes(path);

	test('finds .git in the working directory', () => {
		expect(insideGitRepo('/w/repo', at('/w/repo/.git'))).toBe(true);
	});

	test('finds .git in a parent, as from a package folder', () => {
		expect(insideGitRepo('/w/repo/packages/a/', at('/w/repo/.git'))).toBe(true);
	});

	test('finds .git at the filesystem root', () => {
		expect(insideGitRepo('/w/x', at('/.git'))).toBe(true);
	});

	test('is false when no ancestor has .git, and checks each one once', () => {
		const seen: string[] = [];
		const exists = (path: string) => {
			seen.push(path);
			return false;
		};
		expect(insideGitRepo('/w/scratch', exists)).toBe(false);
		expect(seen).toEqual(['/w/scratch/.git', '/w/.git', '/.git']);
	});

	test('is false for a relative path rather than guessing', () => {
		expect(insideGitRepo('repo', () => true)).toBe(false);
	});
});

describe('buildMandate', () => {
	const mandate = buildMandate();
	const lines = mandate.split('\n');

	test('stays short: a header and five rules', () => {
		expect(lines).toHaveLength(6);
		expect(lines.slice(1).every((line) => line.startsWith('- '))).toBe(true);
	});

	test('points at the skill and names the opt-out', () => {
		expect(lines[0]).toContain('nxgt-autonomy:work-autonomously');
		expect(lines[0]).toContain('NXGT_AUTONOMY_DISABLE=1');
	});

	test.each([
		['the queue, to completion', /Work the queue .* to completion/],
		['the planning cycle when it runs dry', /nxgt-autonomy:plan-the-roadmap/],
		[
			'the refiller, only on the go-ahead',
			/queue-refiller if the owner said to keep going, else the improvement-scout/,
		],
		[
			'the 5-minute rule, through the Claude Code setting',
			/unanswered after 5 minutes \(askUserQuestionTimeout "5m"\) goes to the unanswered-question-resolver/,
		],
		['no unapproved work', /Never start work the queue does not approve/],
		[
			'interactive questions, per the global rules',
			/AskUserQuestion as "Questions to the owner" in ~\/\.claude\/CLAUDE\.md says/,
		],
		[
			'the fallback recommendation label',
			/recommended option first and labelled "\(Recommended\)"/,
		],
		['the irreversible-action limit', /waits for the owner's explicit answer/],
		['no hand-back', /Never end a turn by handing back or waiting/],
		[
			'review, then docs',
			/review-before-a-pr, then nxgt-docs:keep-docs-current/,
		],
		[
			'merges and releases per AGENTS.md',
			/Merges and releases follow the repository's AGENTS\.md, else "Merges and releases" in ~\/\.claude\/CLAUDE\.md/,
		],
	])('carries %s', (_name, pattern) => {
		expect(mandate).toMatch(pattern);
	});

	test('grants nothing: no permission or mode change is asked for', () => {
		expect(mandate).not.toMatch(
			/bypassPermissions|permission mode|--dangerously/i,
		);
	});

	test('is quoted verbatim in the plugin README', () => {
		const readme = readFileSync(
			join(import.meta.dir, '..', '..', 'README.md'),
			'utf8',
		);
		expect(readme).toContain(`\`\`\`text\n${mandate}\n\`\`\``);
	});
});
