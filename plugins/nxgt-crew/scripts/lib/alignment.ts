/**
 * The alignment pass across sessions, over the planning cycle of
 * `nxgt-autonomy:plan-the-roadmap`: each session plans roadmap entries of the
 * repositories it works in, announces them as `plan`, and executes them. This
 * core finds where two sessions' plans meet. Pure: roadmaps arrive as text,
 * sessions as records.
 *
 * - **Duplicate** — the same roadmap entry planned by two sessions.
 * - **Dependency** — a plan waits on something (`@nxgt/mail@0.5.0`) that another
 *   session produces, released already or not.
 * - **Shipped** — a plan for an entry the roadmap already lists as Shipped.
 *
 * For each duplicate it proposes an owner. Proposing is all it does: the
 * sessions agree over SendMessage, and each owner decides through its own
 * user. It never edits a roadmap or a queue.
 */

import { type Plan, planOf } from './announcements';
import { type GitPlace, label, type SessionRecord } from './registry';
import { entryKey, isClosed, type Roadmap } from './roadmap';

/** One session as the alignment pass sees it. */
export interface SessionView {
	readonly record: SessionRecord;
	/** The roadmaps of the worktrees it works in. */
	readonly roadmaps: readonly Roadmap[];
}

/**
 * A repository or package name in one shape: `@nxgt/mail`, `nxgt-mail` and
 * `softistx/nxgt-mail` all become `nxgt-mail`.
 */
export function scopeKey(scope: string): string {
	const s = scope
		.trim()
		.toLowerCase()
		.replace(/\.git$/, '');
	if (s.startsWith('@')) return s.slice(1).replace('/', '-');
	return s.split('/').pop() ?? s;
}

/** `@nxgt/mail@0.5.0` → name `@nxgt/mail`, version `0.5.0`. */
export function splitNeed(need: string): { name: string; version?: string } {
	const at = need.lastIndexOf('@');
	if (at > 0) return { name: need.slice(0, at), version: need.slice(at + 1) };
	return { name: need };
}

/** The repository name of a session: its remote's last segment, else its worktree's folder. */
export function repoName(
	place: Pick<GitPlace, 'remote' | 'worktree'>,
): string | undefined {
	const source = place.remote ?? place.worktree;
	if (!source) return undefined;
	return scopeKey(source.replace(/\/+$/, '').split(/[/:]/).pop() ?? source);
}

/** The well-formed plans a session announced; malformed ones are dropped, never trusted. */
export function plansOf(record: SessionRecord): Plan[] {
	return record.announcements.flatMap((a) => {
		const plan = planOf(a);
		return plan ? [plan] : [];
	});
}

export interface Claimant {
	readonly sessionId: string;
	readonly label: string;
	readonly scope?: string;
	readonly at: string;
}

export interface Duplicate {
	readonly entry: string;
	readonly claimants: readonly Claimant[];
	readonly proposal: { readonly owner: string; readonly why: string };
}

export interface Dependency {
	/** The session whose plan waits. */
	readonly waiting: string;
	readonly entry: string;
	readonly need: string;
	/** The session that produces it, when one is live. */
	readonly producer?: string;
	/** A release announcement already covers it. */
	readonly satisfied: boolean;
	readonly evidence?: string;
}

/** A plan for an entry its roadmap lists as Shipped or Not planned. */
export interface ClosedPlan {
	readonly sessionId: string;
	readonly entry: string;
	readonly roadmap: string;
	readonly section: string;
}

export interface Alignment {
	readonly duplicates: readonly Duplicate[];
	readonly dependencies: readonly Dependency[];
	readonly closed: readonly ClosedPlan[];
}

const scopesMeet = (a?: string, b?: string) =>
	a === undefined || b === undefined || scopeKey(a) === scopeKey(b);

/** Whether a session's own roadmaps list the entry as open (not Shipped, not Not planned). */
function owns(view: SessionView, key: string, scope?: string): boolean {
	return view.roadmaps.some(
		(r) =>
			scopesMeet(scope, r.scope) &&
			r.entries.some((e) => !isClosed(e.section) && entryKey(e.title) === key),
	);
}

/**
 * The session that should take an entry two sessions both planned: the one
 * working in the repository whose roadmap lists it; failing that, or when
 * several do, the one that recorded its accepted plan first — plans are
 * recorded only once the owner accepted, so this is the first acceptance.
 */
export function proposeOwner(
	claimants: readonly Claimant[],
	views: readonly SessionView[],
	key: string,
): { owner: string; why: string } {
	const byTime = [...claimants].sort(
		(a, b) => Date.parse(a.at) - Date.parse(b.at),
	);
	const first = byTime[0] as Claimant;
	const home = byTime.filter((c) => {
		const view = views.find((v) => v.record.sessionId === c.sessionId);
		return view !== undefined && owns(view, key, c.scope);
	});
	if (home.length === 1) {
		const h = home[0] as Claimant;
		return {
			owner: h.sessionId,
			why: `${h.label} works in the repository whose roadmap lists the entry`,
		};
	}
	return {
		owner: first.sessionId,
		why: `${first.label} recorded its accepted plan first (${first.at})`,
	};
}

function producerOf(
	name: string,
	views: readonly SessionView[],
	except: string,
): SessionView | undefined {
	const key = scopeKey(name);
	return views.find(
		(v) =>
			v.record.sessionId !== except &&
			(repoName(v.record) === key ||
				v.roadmaps.some((r) => scopeKey(r.scope) === key) ||
				plansOf(v.record).some((p) => p.scope && scopeKey(p.scope) === key)),
	);
}

/** A release announcement's words, lower-cased, with surrounding punctuation dropped. */
export function releaseTokens(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[\s,;()[\]]+/)
		.map((t) => t.replace(/^[`'"]+/, '').replace(/[`'".:!?]+$/, ''))
		.filter(Boolean);
}

/**
 * Whether a release announcement covers a need. Name and version must each be
 * a whole word — `@nxgt/mail 0.5.0`, `@nxgt/mail@0.5.0` or `v0.5.0` — so
 * `@nxgt/mail-config 10.5.0` covers neither `@nxgt/mail` nor `0.5.0`.
 */
export function releaseCovers(
	text: string,
	name: string,
	version?: string,
): boolean {
	const tokens = releaseTokens(text);
	const n = name.toLowerCase();
	const v = version?.toLowerCase().replace(/^v/, '');
	if (v !== undefined && tokens.includes(`${n}@${v}`)) return true;
	if (!tokens.includes(n)) return false;
	return v === undefined || tokens.includes(v) || tokens.includes(`v${v}`);
}

function releaseCovering(
	name: string,
	version: string | undefined,
	views: readonly SessionView[],
	except: string,
): { view: SessionView; text: string } | undefined {
	for (const view of views) {
		if (view.record.sessionId === except) continue;
		for (const a of view.record.announcements) {
			if (a.kind === 'release' && releaseCovers(a.text, name, version)) {
				return { view, text: a.text };
			}
		}
	}
	return undefined;
}

export function align(views: readonly SessionView[]): Alignment {
	const byKey = new Map<string, { entry: string; claimants: Claimant[] }>();
	const closed: ClosedPlan[] = [];
	const dependencies: Dependency[] = [];

	for (const view of views) {
		const r = view.record;
		for (const plan of plansOf(r)) {
			const entry = plan.entry;
			const key = entryKey(entry);
			const claimant: Claimant = {
				sessionId: r.sessionId,
				label: label(r),
				at: plan.at,
				...(plan.scope ? { scope: plan.scope } : {}),
			};
			const slot = byKey.get(key) ?? { entry, claimants: [] };
			if (!slot.claimants.some((c) => c.sessionId === r.sessionId)) {
				slot.claimants.push(claimant);
			}
			byKey.set(key, slot);

			for (const roadmap of views.flatMap((v) => v.roadmaps)) {
				if (!scopesMeet(plan.scope, roadmap.scope)) continue;
				const hit = roadmap.entries.find(
					(e) => isClosed(e.section) && entryKey(e.title) === key,
				);
				if (
					hit &&
					!closed.some((c) => c.sessionId === r.sessionId && c.entry === entry)
				) {
					closed.push({
						sessionId: r.sessionId,
						entry,
						roadmap: roadmap.path,
						section: hit.section,
					});
				}
			}

			for (const need of plan.needs ?? []) {
				const { name, version } = splitNeed(need);
				const release = releaseCovering(name, version, views, r.sessionId);
				const producer = release?.view ?? producerOf(name, views, r.sessionId);
				dependencies.push({
					waiting: r.sessionId,
					entry,
					need,
					satisfied: release !== undefined,
					...(producer ? { producer: producer.record.sessionId } : {}),
					...(release ? { evidence: release.text } : {}),
				});
			}
		}
	}

	const duplicates: Duplicate[] = [];
	for (const [key, { entry, claimants }] of byKey) {
		const conflicting = claimants.filter((c) =>
			claimants.some(
				(o) => o.sessionId !== c.sessionId && scopesMeet(o.scope, c.scope),
			),
		);
		if (conflicting.length < 2) continue;
		duplicates.push({
			entry,
			claimants: conflicting,
			proposal: proposeOwner(conflicting, views, key),
		});
	}
	return { duplicates, dependencies, closed };
}
