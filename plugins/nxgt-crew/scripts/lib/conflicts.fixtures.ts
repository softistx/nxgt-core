/** Shared places, sessions and helpers for the conflict specs. */

import { announce } from './announcements';
import { evaluateBash } from './bash-rules';
import { parseCommand } from './command';
import type { Context, Verdict } from './conflicts';
import { minutesAgo, NOW, peer, record, SETTINGS } from './fixtures';
import type { GitPlace, SessionRecord } from './record';

export const MAIN: GitPlace = {
	worktree: '/repo',
	repo: '/repo/.git',
	branch: 'develop',
	remote: 'git@github.com:o/r.git',
};
export const WT: GitPlace = {
	worktree: '/tmp/wt',
	repo: '/repo/.git',
	branch: 'feat/x',
	remote: 'git@github.com:o/r.git',
};
export const OTHER: GitPlace = {
	worktree: '/other',
	repo: '/other/.git',
	branch: 'develop',
};

export const self = record('self', { cwd: '/tmp/wt', ...WT });
export const inMain = announce(
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

export const ctx = (
	peers: SessionRecord[],
	me: SessionRecord = self,
): Context => ({
	self: me,
	peers: peers.map((p) => peer(p)),
	now: NOW,
	settings: SETTINGS,
});

export const places: Record<string, GitPlace> = {
	'/repo': MAIN,
	'/tmp/wt': WT,
	'/other': OTHER,
};
export const placeOf = (dir: string) => places[dir] ?? {};
export const bash = (
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
export const denied = (v: Verdict) => v.decision === 'deny';
