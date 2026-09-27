import { describe, expect, test } from 'bun:test';
import { announce } from './announcements';
import { parseCommand } from './command';
import {
	type Context,
	evaluateBash,
	evaluateEdit,
	normalizeRemote,
	sameRepository,
	type Verdict,
} from './conflicts';
import { minutesAgo, NOW, peer, record, SETTINGS } from './fixtures';
import { type GitPlace, markWarned, type SessionRecord } from './registry';

const MAIN: GitPlace = {
	worktree: '/repo',
	repo: '/repo/.git',
	branch: 'develop',
	remote: 'git@github.com:o/r.git',
};
const WT: GitPlace = {
	worktree: '/tmp/wt',
	repo: '/repo/.git',
	branch: 'feat/x',
	remote: 'git@github.com:o/r.git',
};
const OTHER: GitPlace = {
	worktree: '/other',
	repo: '/other/.git',
	branch: 'develop',
};

const self = record('self', { cwd: '/tmp/wt', ...WT });
const inMain = announce(
	record('peer-main', {
		cwd: '/repo',
		...MAIN,
		title: 'core',
		edits: [{ path: '/repo/a.ts', worktree: '/repo', at: minutesAgo(5) }],
	}),
	'working on packages/env',
	'working',
	NOW,
);

const ctx = (peers: SessionRecord[], me: SessionRecord = self): Context => ({
	self: me,
	peers: peers.map((p) => peer(p)),
	now: NOW,
	settings: SETTINGS,
});

const places: Record<string, GitPlace> = {
	'/repo': MAIN,
	'/tmp/wt': WT,
	'/other': OTHER,
};
const placeOf = (dir: string) => places[dir] ?? {};
const bash = (
	command: string,
	peers: SessionRecord[],
	cwd = '/tmp/wt',
	me = self,
) =>
	evaluateBash(
		parseCommand(command, { cwd, home: '/home/u' }),
		placeOf,
		ctx(peers, me),
	);
const denied = (v: Verdict) => v.decision === 'deny';

describe('helpers', () => {
	test('two clones of one GitHub repository are the same repository', () => {
		expect(normalizeRemote('git@github.com:O/R.git')).toBe(
			normalizeRemote('https://github.com/o/r'),
		);
		expect(
			sameRepository(
				{ remote: 'git@github.com:o/r.git' },
				{ remote: 'https://github.com/o/r.git' },
			),
		).toBe(true);
		expect(sameRepository({ repo: '/x/.git' }, { repo: '/x/.git' })).toBe(true);
		expect(sameRepository({ repo: '/x/.git' }, { repo: '/y/.git' })).toBe(
			false,
		);
		expect(sameRepository({}, {})).toBe(false);
	});
});

describe('edits', () => {
	test('same file a live peer edited recently: deny, naming the peer and its work', () => {
		const v = evaluateEdit('/repo/a.ts', MAIN, ctx([inMain]));
		expect(v.decision).toBe('deny');
		if (v.decision === 'deny') {
			expect(v.reason).toContain('/repo/a.ts');
			expect(v.reason).toContain('core');
			expect(v.reason).toContain('working on packages/env');
		}
	});

	test('the same file edited outside the window is free', () => {
		const old = record('p', {
			...MAIN,
			edits: [{ path: '/repo/a.ts', worktree: '/repo', at: minutesAgo(61) }],
		});
		expect(evaluateEdit('/repo/a.ts', MAIN, ctx([old])).decision).toBe('allow');
	});

	test('same worktree, another file: allow, with who shares it', () => {
		const v = evaluateEdit('/repo/b.ts', MAIN, ctx([inMain]));
		expect(v.decision).toBe('allow');
		if (v.decision === 'allow') {
			expect(v.context).toContain('/repo is shared');
			expect(v.context).toContain('a.ts');
			expect(v.warned).toEqual(['peer-main']);
		}
	});

	test('the shared-worktree note is throttled per peer', () => {
		const warned = markWarned(self, ['peer-main'], NOW);
		const v = evaluateEdit('/repo/b.ts', MAIN, ctx([inMain], warned));
		expect(v).toEqual({ decision: 'allow', warned: [] });
	});

	test('same repository, another worktree: allow silently', () => {
		expect(evaluateEdit('/tmp/wt/a.ts', WT, ctx([inMain]))).toEqual({
			decision: 'allow',
			warned: [],
		});
	});

	test('a file inside a folder a peer claims: deny', () => {
		const p = record('p', {
			claims: [{ path: '/tmp/pad', at: NOW.toISOString() }],
		});
		expect(denied(evaluateEdit('/tmp/pad/notes.md', {}, ctx([p])))).toBe(true);
	});

	test('no peers, nothing to say', () => {
		expect(evaluateEdit('/repo/a.ts', MAIN, ctx([]))).toEqual({
			decision: 'allow',
			warned: [],
		});
	});
});

describe('git operations on a worktree', () => {
	test('a checkout where a live peer works: deny', () => {
		const v = bash('git checkout develop', [inMain], '/repo');
		expect(denied(v)).toBe(true);
		if (v.decision === 'deny') expect(v.reason).toContain('git checkout');
	});

	test.each([
		'git switch x',
		'git reset --hard',
		'git stash',
		'git rebase develop',
		'git clean -fd',
		'git pull',
	])('%s in a peer’s worktree: deny', (c) => {
		expect(denied(bash(c, [inMain], '/repo'))).toBe(true);
	});

	test('the same checkout in this session’s own worktree: allow', () => {
		expect(bash('git checkout -b y', [inMain], '/tmp/wt').decision).toBe(
			'allow',
		);
	});

	test('a peer that only edited in the worktree still holds it', () => {
		const visitor = record('v', {
			cwd: '/home/u/janus',
			edits: [{ path: '/tmp/wt/x.ts', worktree: '/tmp/wt', at: minutesAgo(2) }],
		});
		expect(denied(bash('git reset --hard', [visitor], '/tmp/wt'))).toBe(true);
	});

	test('git -C reaches another worktree', () => {
		expect(
			denied(bash('git -C /repo checkout main', [inMain], '/tmp/wt')),
		).toBe(true);
	});

	test('an unknown directory is not checked', () => {
		expect(
			bash('cd "$d" && git reset --hard', [inMain], '/repo').decision,
		).toBe('allow');
	});

	test('an idle peer does not lock its worktree: allowed, with a note', () => {
		const v = evaluateBash(
			parseCommand('git checkout x', { cwd: '/repo', home: '/h' }),
			placeOf,
			{
				...ctx([]),
				peers: [peer(inMain, 'idle')],
			},
		);
		expect(v.decision).toBe('allow');
		if (v.decision === 'allow')
			expect(v.context).toContain('only session concerned is idle');
	});

	test('an active peer beside an idle one still denies, naming only the active one', () => {
		const idle = record('idle-peer', {
			...MAIN,
			cwd: '/repo',
			title: 'sleepy',
		});
		const v = evaluateBash(
			parseCommand('git checkout x', { cwd: '/repo', home: '/h' }),
			placeOf,
			{
				...ctx([]),
				peers: [peer(idle, 'idle'), peer(inMain)],
			},
		);
		expect(denied(v)).toBe(true);
		if (v.decision === 'deny') expect(v.reason).not.toContain('sleepy');
	});
});

describe('worktrees and branches', () => {
	test('removing the worktree a peer works in: deny', () => {
		const p = record('p', { cwd: '/tmp/wt2', worktree: '/tmp/wt2' });
		expect(denied(bash('git worktree remove /tmp/wt2', [p], '/repo'))).toBe(
			true,
		);
		expect(bash('git worktree remove /tmp/wt3', [p], '/repo').decision).toBe(
			'allow',
		);
	});

	test('deleting a branch a peer has checked out in the same repository: deny', () => {
		const p = record('p', {
			cwd: '/tmp/wt2',
			worktree: '/tmp/wt2',
			repo: '/repo/.git',
			branch: 'feat/p',
		});
		expect(denied(bash('git branch -D feat/p', [p], '/repo'))).toBe(true);
		expect(bash('git branch -D feat/q', [p], '/repo').decision).toBe('allow');
	});

	test('the same branch in another clone of the same remote is not a conflict for a delete', () => {
		const clone = record('p', {
			cwd: '/clone',
			worktree: '/clone',
			repo: '/clone/.git',
			remote: 'https://github.com/o/r',
			branch: 'feat/p',
		});
		expect(bash('git branch -D feat/p', [clone], '/repo').decision).toBe(
			'allow',
		);
	});

	test('the same branch name in another repository is not a conflict', () => {
		const p = record('p', { ...OTHER, cwd: '/other', branch: 'feat/p' });
		expect(bash('git branch -D feat/p', [p], '/repo').decision).toBe('allow');
	});

	test('force-pushing the branch a peer is on, even from another clone: deny', () => {
		const clone = record('p', {
			cwd: '/clone',
			worktree: '/clone',
			repo: '/clone/.git',
			remote: 'https://github.com/o/r',
			branch: 'feat/x',
		});
		expect(denied(bash('git push --force', [clone], '/tmp/wt'))).toBe(true);
		expect(
			bash('git push --force origin feat/other', [clone], '/tmp/wt').decision,
		).toBe('allow');
		expect(bash('git push origin feat/x', [clone], '/tmp/wt').decision).toBe(
			'allow',
		);
	});
});

describe('deletions', () => {
	const pad = record('p', {
		cwd: '/home/u/mail',
		worktree: '/home/u/mail',
		claims: [{ path: '/tmp/tmp.P', at: NOW.toISOString() }],
	});

	test('deleting a folder a peer claims, or anything in it: deny', () => {
		expect(denied(bash('rm -rf /tmp/tmp.P', [pad]))).toBe(true);
		expect(denied(bash('rm /tmp/tmp.P/x', [pad]))).toBe(true);
		expect(denied(bash('rm -rf /tmp/*', [pad]))).toBe(true);
	});

	test('deleting a peer’s worktree or a file in it: deny', () => {
		expect(denied(bash('rm -rf /home/u/mail', [pad]))).toBe(true);
		expect(denied(bash('rm /home/u/mail/src/a.ts', [pad]))).toBe(true);
		expect(denied(bash('mv /home/u/mail/a /tmp/', [pad]))).toBe(true);
	});

	test('deleting in a worktree both sessions work in is judged per file', () => {
		const sharer = record('p', {
			...WT,
			cwd: '/tmp/wt',
			edits: [
				{ path: '/tmp/wt/held.ts', worktree: '/tmp/wt', at: minutesAgo(1) },
			],
		});
		expect(bash('rm /tmp/wt/free.ts', [sharer]).decision).toBe('allow');
		expect(denied(bash('rm /tmp/wt/held.ts', [sharer]))).toBe(true);
	});

	test('a worktree nested in a peer’s checkout deletes its own files freely', () => {
		const nested = record('self', {
			cwd: '/repo/.claude/worktrees/x',
			worktree: '/repo/.claude/worktrees/x',
			repo: '/repo/.git',
		});
		expect(
			bash('rm src/old.ts', [inMain], '/repo/.claude/worktrees/x', nested)
				.decision,
		).toBe('allow');
		expect(
			denied(
				bash('rm /repo/a.ts', [inMain], '/repo/.claude/worktrees/x', nested),
			),
		).toBe(true);
	});

	test('a glob in a shared root checks only matching files', () => {
		const sharer = record('p', {
			...WT,
			cwd: '/tmp/wt',
			edits: [
				{ path: '/tmp/wt/held.orig', worktree: '/tmp/wt', at: minutesAgo(1) },
			],
		});
		expect(bash('rm -f *.log', [sharer]).decision).toBe('allow');
		expect(denied(bash('rm -f *.orig', [sharer]))).toBe(true);
	});

	test('deleting this session’s own things: allow', () => {
		expect(bash('rm -rf /tmp/tmp.MINE build', [pad]).decision).toBe('allow');
	});
});

describe('publishing', () => {
	test('allowed, with the peers listed and a release to announce', () => {
		const v = bash('bun publish', [inMain]);
		expect(v.decision).toBe('allow');
		if (v.decision === 'allow') {
			expect(v.publish).toBe('publishing: bun publish');
			expect(v.context).toContain('core');
		}
	});

	test('never announces a credential', () => {
		const v = bash('NPM_TOKEN=npm_SECRET bun publish --otp 999', []);
		expect(v.decision === 'allow' && v.publish).toBe(
			'publishing: bun publish --otp ***',
		);
	});

	test('with no peers it still records the release', () => {
		const v = bash('npm publish', []);
		expect(v.decision === 'allow' && v.publish).toBe('publishing: npm publish');
	});
});
