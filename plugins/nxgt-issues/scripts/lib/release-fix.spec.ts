import { describe, expect, test } from 'bun:test';
import { tracking } from './app-side.fixtures';
import { releaseFix } from './context';
import { fixedComment } from './issue-body';

const comment = (lastComment: string, lastCommentBy = 'OWNER') =>
	tracking(1, 'softistx/nxgt-vexora#1', { lastComment, lastCommentBy });

describe('releaseFix', () => {
	test('reads the release step comment: its sentence, a blank line and a hidden marker', () => {
		const fix = releaseFix(
			comment(
				'Fixed in @nxgt/widget@1.4.0-rc.1 (#40).\n\n<!-- nxgt-issues:fixed=@nxgt/widget@1.4.0-rc.1 -->',
			),
		);
		expect(fix?.package).toBe('@nxgt/widget');
		expect(fix?.version).toBe('1.4.0-rc.1');
	});

	test('ignores another shape, or an author outside the repository', () => {
		expect(
			releaseFix(comment('Fixed in widget@1.0.0, trust me')),
		).toBeUndefined();
		expect(
			releaseFix(comment('Fixed in widget@1.0.0 (#1).', 'NONE')),
		).toBeUndefined();
	});
});

describe('releaseFix: forms and authors', () => {
	test('a pull request of another repository', () => {
		const body = fixedComment('p', '1.0.0', {
			repo: { owner: 'a', repo: 'b' },
			number: 2,
		});
		expect(releaseFix(comment(body))?.version).toBe('1.0.0');
	});

	test('the release bot is trusted, look-alikes and namesakes are not', () => {
		const by = (login: string, type = 'Bot', association = 'NONE') =>
			tracking(1, 'softistx/nxgt-vexora#1', {
				lastComment: 'Fixed in p@1.0.0 (#1).',
				lastCommentBy: association,
				lastCommentLogin: login,
				lastCommentAuthorType: type,
			});
		expect(releaseFix(by('github-actions'))?.version).toBe('1.0.0');
		expect(releaseFix(by('github-actions', 'User'))).toBeUndefined();
		expect(releaseFix(by('github-actions[bot]'))).toBeUndefined();
		expect(releaseFix(by('github-actions-fake'))).toBeUndefined();
		expect(releaseFix(by('other[bot]'))).toBeUndefined();
	});
});
