import { describe, expect, test } from 'bun:test';
import { evaluateEdit } from './conflicts';
import { ctx, denied, inMain, MAIN, self, WT } from './conflicts.fixtures';
import { minutesAgo, NOW, record } from './fixtures';
import { markWarned } from './holds';
import { normalizeRemote, sameRepository } from './scope';

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
