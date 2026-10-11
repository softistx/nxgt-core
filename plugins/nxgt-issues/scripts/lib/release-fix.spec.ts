import { describe, expect, test } from 'bun:test';
import { tracking } from './app-side.fixtures';
import { releaseFix } from './context';

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
