import { describe, expect, test } from 'bun:test';
import { announce } from './announcements';
import { brief, digest, listing, partition } from './brief';
import { minutesAgo, NOW, peer, record, SETTINGS } from './fixtures';

const self = record('self-000000', {
	cwd: '/repo',
	worktree: '/repo',
	repo: '/repo/.git',
	branch: 'develop',
});
const sibling = announce(
	record('sibling-11', {
		cwd: '/repo',
		worktree: '/repo',
		repo: '/repo/.git',
		branch: 'develop',
		title: 'core',
		edits: [{ path: '/repo/src/a.ts', worktree: '/repo', at: minutesAgo(3) }],
	}),
	'publishing @nxgt/mail 0.5.0',
	'release',
	NOW,
);
const faraway = record('faraway-22', {
	cwd: '/mail',
	worktree: '/mail',
	repo: '/mail/.git',
	branch: 'feat/m',
	lastSeen: minutesAgo(90),
});

describe('partition', () => {
	test('same repository first, the rest elsewhere', () => {
		const { same, elsewhere } = partition(self, [peer(faraway), peer(sibling)]);
		expect(same.map((p) => p.record.sessionId)).toEqual(['sibling-11']);
		expect(elsewhere.map((p) => p.record.sessionId)).toEqual(['faraway-22']);
	});
});

describe('brief', () => {
	test('alone', () => {
		expect(brief(self, [], NOW, SETTINGS)).toBe(
			'nxgt-crew: this session is self-000, in /repo on develop. No other live session is registered.',
		);
	});

	test('names peers with their place, announcements, files, and a shared worktree', () => {
		const text = brief(
			self,
			[peer(sibling), peer(faraway, 'idle')],
			NOW,
			SETTINGS,
		);
		expect(text).toContain('2 other live sessions');
		expect(text.indexOf('Same repository:')).toBeLessThan(
			text.indexOf('Elsewhere:'),
		);
		expect(text).toContain(
			'core [sibling-] — /repo on develop (seen 0 min ago)'.replace(
				'0 min ago',
				'just now',
			),
		);
		expect(text).toContain('shares this session’s worktree');
		expect(text).toContain('release: publishing @nxgt/mail 0.5.0');
		expect(text).toContain('recent files: src/a.ts');
		expect(text).toContain('(idle, seen 90 min ago)');
	});
});

describe('digest', () => {
	test('nothing new, nothing said', () => {
		expect(digest([], NOW)).toBeUndefined();
	});

	test('one line per announcement', () => {
		const text = digest(
			[{ peer: sibling, announcement: sibling.announcements[0] as never }],
			NOW,
		);
		expect(text).toContain(
			'core [sibling-] release: publishing @nxgt/mail 0.5.0',
		);
	});
});

describe('listing', () => {
	test('this session first', () => {
		const text = listing(
			announce(self, 'packages/env', 'working', NOW),
			[peer(sibling)],
			NOW,
			SETTINGS,
		);
		expect(text.split('\n')[0]).toBe(
			'This session: self-000 [self-000] — /repo on develop',
		);
		expect(text).toContain('working: packages/env');
	});

	test('an unregistered session still sees its peers', () => {
		const text = listing(undefined, [peer(sibling)], NOW, SETTINGS);
		expect(text).toContain('not registered');
		expect(text).toContain('core [sibling-]');
	});
});
