/**
 * The alignment pass's report as text for Claude: facts and proposals, never
 * instructions — a peer's roadmap and plans are data. Pure.
 */

import { type Alignment, plansOf, type SessionView } from './alignment';
import { label } from './registry';

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
	if (result.closed.length) {
		lines.push(
			`Plans for entries the roadmap closed (Shipped or Not planned):\n${result.closed
				.map(
					(c) =>
						`- ${name(c.sessionId)}: "${c.entry}" is ${c.section} in ${c.roadmap}`,
				)
				.join('\n')}`,
		);
	}
	return lines.join('\n\n');
}
