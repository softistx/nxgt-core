/**
 * The text a session reads about its peers: the brief SessionStart puts in
 * context, the digest of new announcements, and `/crew`'s listing. Written as
 * facts, not instructions — hook output phrased as commands reads like a
 * prompt injection, and Claude rightly distrusts it.
 */

import type { Unseen } from './announcements';
import { worktreesOf } from './conflicts';
import { recentEdits } from './holds';
import type { Peer } from './liveness';
import { isInside } from './paths';
import { label, type SessionRecord } from './record';
import { sameRepository } from './scope';
import type { Settings } from './settings';
import { ago } from './time';

/** Peers in this session's repository first, then the rest. */
export function partition(
	self: SessionRecord,
	peers: readonly Peer[],
): { same: Peer[]; elsewhere: Peer[] } {
	const same: Peer[] = [];
	const elsewhere: Peer[] = [];
	for (const p of peers) {
		(sameRepository(self, p.record) ? same : elsewhere).push(p);
	}
	return { same, elsewhere };
}

export function peerBlock(
	peer: Peer,
	self: SessionRecord,
	now: Date,
	settings: Settings,
): string {
	const r = peer.record;
	const where = r.worktree ?? r.cwd;
	const branch = r.branch ? ` on ${r.branch}` : '';
	const state = peer.liveness === 'idle' ? 'idle, ' : '';
	const lines = [
		`- ${label(r)} [${r.sessionId.slice(0, 8)}] — ${where}${branch} (${state}seen ${ago(r.lastSeen, now)})`,
	];
	const shared =
		self.worktree !== undefined &&
		worktreesOf(r, now, settings).has(self.worktree);
	if (shared) lines.push('  shares this session’s worktree');
	for (const a of r.announcements.slice(0, 3)) {
		lines.push(`  ${a.kind}: ${a.text} (${ago(a.at, now)})`);
	}
	const edits = recentEdits(r, now, settings).slice(0, 5);
	if (edits.length) {
		const names = edits.map((e) =>
			e.worktree && isInside(e.path, e.worktree)
				? e.path.slice(e.worktree.length + 1)
				: e.path,
		);
		lines.push(`  recent files: ${names.join(', ')}`);
	}
	const claims = r.claims.filter((c) => c.note !== 'scratchpad').slice(0, 3);
	if (claims.length) {
		lines.push(
			`  claims: ${claims.map((c) => (c.note ? `${c.path} (${c.note})` : c.path)).join(', ')}`,
		);
	}
	return lines.join('\n');
}

export function brief(
	self: SessionRecord,
	peers: readonly Peer[],
	now: Date,
	settings: Settings,
): string {
	const here = self.worktree ?? self.cwd;
	const branch = self.branch ? ` on ${self.branch}` : '';
	const head = `nxgt-crew: this session is ${self.sessionId.slice(0, 8)}, in ${here}${branch}.`;
	if (!peers.length) {
		return `${head} No other live session is registered.`;
	}
	const { same, elsewhere } = partition(self, peers);
	const parts = [
		`${head} ${peers.length} other live session${peers.length === 1 ? '' : 's'}:`,
	];
	if (same.length) {
		parts.push('Same repository:');
		for (const p of same) parts.push(peerBlock(p, self, now, settings));
	}
	if (elsewhere.length) {
		parts.push(same.length ? 'Elsewhere:' : 'Other repositories:');
		for (const p of elsewhere) parts.push(peerBlock(p, self, now, settings));
	}
	parts.push(
		'The crew guard blocks an edit to a file a live peer edited recently, and a checkout, reset, stash, rebase or worktree removal where a live peer works. /crew lists sessions and records an announcement; the session-coordinator agent checks alignment before a release or a change to a shared repository.',
	);
	return parts.join('\n');
}

export function digest(
	unseen: readonly Unseen[],
	now: Date,
): string | undefined {
	if (!unseen.length) return undefined;
	const lines = unseen.map(
		({ peer, announcement }) =>
			`- ${label(peer)} [${peer.sessionId.slice(0, 8)}] ${announcement.kind}: ${announcement.text} (${ago(announcement.at, now)})`,
	);
	return `nxgt-crew: new announcements from other live sessions:\n${lines.join('\n')}`;
}

/** `/crew`'s listing: this session first, then its peers as in the brief. */
export function listing(
	self: SessionRecord | undefined,
	peers: readonly Peer[],
	now: Date,
	settings: Settings,
): string {
	if (!self) {
		const lines = peers.map((p) =>
			peerBlock(p, { ...p.record, worktree: undefined }, now, settings),
		);
		return [
			'nxgt-crew: this session is not registered (the hooks have not run for it).',
			peers.length ? `${peers.length} live session(s):` : 'No live session.',
			...lines,
		].join('\n');
	}
	const mine = [
		`This session: ${label(self)} [${self.sessionId.slice(0, 8)}] — ${self.worktree ?? self.cwd}${self.branch ? ` on ${self.branch}` : ''}`,
		...self.announcements
			.slice(0, 3)
			.map((a) => `  ${a.kind}: ${a.text} (${ago(a.at, now)})`),
	];
	return [...mine, brief(self, peers, now, settings)].join('\n');
}
