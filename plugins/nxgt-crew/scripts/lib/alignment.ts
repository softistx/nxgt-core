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

import { type Announcement, label, type SessionRecord } from './registry';

export interface RoadmapEntry {
	/** The `##` section it sits under: Now, Next, Later, Not planned, Shipped. */
	readonly section: string;
	readonly title: string;
}

export interface Roadmap {
	/** Absolute path of the docs/roadmap.md. */
	readonly path: string;
	/** What it is the roadmap of: the package name, else the repository name. */
	readonly scope: string;
	readonly entries: readonly RoadmapEntry[];
}

/** One session as the alignment pass sees it. */
export interface SessionView {
	readonly record: SessionRecord;
	/** The roadmaps of the worktrees it works in. */
	readonly roadmaps: readonly Roadmap[];
}

/**
 * The top-level list items of a roadmap, under their `##`/`###` section. An
 * item's title is its bold text when it has some, else the text before the
 * first ` — `, ` - ` or `: `.
 */
export function parseRoadmap(markdown: string): RoadmapEntry[] {
	const out: RoadmapEntry[] = [];
	let section = '';
	let fence = false;
	for (const line of markdown.split('\n')) {
		if (/^\s*```/.test(line)) fence = !fence;
		if (fence) continue;
		const heading = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) {
			section = (heading[1] as string).trim();
			continue;
		}
		const item = /^[-*]\s+(.+)$/.exec(line);
		if (!item || !section) continue;
		const text = (item[1] as string).replace(/^\[[ xX]\]\s+/, '');
		const bold = /\*\*(.+?)\*\*/.exec(text);
		const title = (
			bold ? (bold[1] as string) : (text.split(/\s+[—–-]\s+|:\s/)[0] as string)
		)
			.replace(/`/g, '')
			.trim();
		if (title) out.push({ section, title });
	}
	return out;
}

/** A roadmap entry's identity: case, punctuation and markdown ignored. */
export function entryKey(title: string): string {
	return title
		.toLowerCase()
		.replace(/[`*_]/g, '')
		.replace(/[^a-z0-9@/.]+/g, ' ')
		.trim();
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
export function repoName(record: SessionRecord): string | undefined {
	const source = record.remote ?? record.worktree;
	if (!source) return undefined;
	return scopeKey(source.replace(/\/+$/, '').split(/[/:]/).pop() ?? source);
}

export const plansOf = (record: SessionRecord): Announcement[] =>
	record.announcements.filter((a) => a.kind === 'plan' && a.entry);

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

export interface StalePlan {
	readonly sessionId: string;
	readonly entry: string;
	readonly roadmap: string;
}

export interface Alignment {
	readonly duplicates: readonly Duplicate[];
	readonly dependencies: readonly Dependency[];
	readonly shipped: readonly StalePlan[];
}

const scopesMeet = (a?: string, b?: string) =>
	a === undefined || b === undefined || scopeKey(a) === scopeKey(b);

/** Whether a session's own roadmaps list the entry (in any section but Shipped). */
function owns(view: SessionView, key: string, scope?: string): boolean {
	return view.roadmaps.some(
		(r) =>
			scopesMeet(scope, r.scope) &&
			r.entries.some(
				(e) => e.section !== 'Shipped' && entryKey(e.title) === key,
			),
	);
}

/**
 * The session that should take an entry two sessions both planned: the one
 * working in the repository whose roadmap lists it; failing that, or when
 * several do, the one that announced it first.
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
		why: `${first.label} announced it first (${first.at})`,
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

function releaseCovering(
	name: string,
	version: string | undefined,
	views: readonly SessionView[],
	except: string,
): { view: SessionView; text: string } | undefined {
	const n = name.toLowerCase();
	for (const view of views) {
		if (view.record.sessionId === except) continue;
		for (const a of view.record.announcements) {
			const text = a.text.toLowerCase();
			if (a.kind !== 'release' || !text.includes(n)) continue;
			if (version && !text.includes(version.toLowerCase())) continue;
			return { view, text: a.text };
		}
	}
	return undefined;
}

export function align(views: readonly SessionView[]): Alignment {
	const byKey = new Map<string, { entry: string; claimants: Claimant[] }>();
	const shipped: StalePlan[] = [];
	const dependencies: Dependency[] = [];

	for (const view of views) {
		const r = view.record;
		for (const plan of plansOf(r)) {
			const entry = plan.entry as string;
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
				const done = roadmap.entries.some(
					(e) => e.section === 'Shipped' && entryKey(e.title) === key,
				);
				if (
					done &&
					!shipped.some((s) => s.sessionId === r.sessionId && s.entry === entry)
				) {
					shipped.push({
						sessionId: r.sessionId,
						entry,
						roadmap: roadmap.path,
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
	return { duplicates, dependencies, shipped };
}

/** The alignment as text for Claude: facts and proposals, no instructions. */
export function renderAlignment(
	result: Alignment,
	views: readonly SessionView[],
	selfId: string,
): string {
	const name = (id: string | undefined) => {
		if (id === undefined) return 'no live session';
		const v = views.find((x) => x.record.sessionId === id);
		const base = v ? `${label(v.record)} [${id.slice(0, 8)}]` : id.slice(0, 8);
		return id === selfId ? `${base} (this session)` : base;
	};
	const lines: string[] = [];
	const roadmaps = views.flatMap((v) =>
		v.roadmaps.map(
			(r) => `- ${name(v.record.sessionId)}: ${r.scope} — ${r.path}`,
		),
	);
	lines.push(
		roadmaps.length
			? `Roadmaps read (${roadmaps.length}):\n${roadmaps.join('\n')}`
			: 'Roadmaps read: none found in the live sessions’ worktrees.',
	);
	const plans = views.flatMap((v) =>
		plansOf(v.record).map(
			(p) =>
				`- ${name(v.record.sessionId)}: ${p.entry}${p.scope ? ` (${p.scope})` : ''}${p.needs?.length ? `, needs ${p.needs.join(', ')}` : ''}`,
		),
	);
	lines.push(
		plans.length
			? `Announced plans:\n${plans.join('\n')}`
			: 'Announced plans: none.',
	);
	lines.push(
		result.duplicates.length
			? `Same entry in two sessions:\n${result.duplicates
					.map(
						(d) =>
							`- "${d.entry}": ${d.claimants.map((c) => name(c.sessionId)).join(' and ')}. Proposed owner: ${name(d.proposal.owner)} — ${d.proposal.why}.`,
					)
					.join('\n')}`
			: 'Same entry in two sessions: none.',
	);
	lines.push(
		result.dependencies.length
			? `Dependencies:\n${result.dependencies
					.map(
						(d) =>
							`- ${name(d.waiting)} "${d.entry}" needs ${d.need}: ${d.satisfied ? `released (${d.evidence})` : `not yet released; produced by ${name(d.producer)}`}.`,
					)
					.join('\n')}`
			: 'Dependencies: none announced.',
	);
	if (result.shipped.length) {
		lines.push(
			`Plans for entries already Shipped:\n${result.shipped
				.map((s) => `- ${name(s.sessionId)}: "${s.entry}" (${s.roadmap})`)
				.join('\n')}`,
		);
	}
	return lines.join('\n\n');
}
