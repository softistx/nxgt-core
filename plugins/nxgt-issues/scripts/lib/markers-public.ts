/** A public application keeps no tracking issue: its untracked markers read the upstream issue itself. */

import type { CliContext } from './cli-context';
import { releaseFix } from './context';
import { type Judged, type MarkerReport, versionFor } from './markers-types';
import { fetchUpstream, type UpstreamIssue } from './refresh';

export async function lookUpPublic(
	ctx: CliContext,
	judged: readonly Judged[],
): Promise<MarkerReport[]> {
	const wanted = [
		...new Set(
			judged.flatMap((j) =>
				j.report.status === 'untracked' && j.upstream ? [j.upstream] : [],
			),
		),
	];
	const refs = wanted.map((text) => {
		const [repo = '', number = ''] = text.split('#');
		const [owner = '', name = ''] = repo.split('/');
		return { repo: { owner, repo: name }, number: Number(number) };
	});
	const found = new Map<string, UpstreamIssue | undefined>();
	(await fetchUpstream(ctx, refs)).forEach((issue, i) => {
		found.set(wanted[i] ?? '', issue);
	});
	return judged.map(({ report, upstream, target }) => {
		if (report.status !== 'untracked' || !upstream) return report;
		const issue = found.get(upstream);
		const note = report.detail;
		const base = {
			file: report.file,
			line: report.line,
			upstream: report.upstream,
		};
		if (!issue?.state) {
			return {
				...base,
				status: 'unresolvable',
				detail: `${upstream} not found`,
			};
		}
		if (issue.state === 'CLOSED' && issue.labels.includes('released')) {
			const fix = releaseFix(issue);
			return {
				...base,
				status: 'ready',
				detail:
					'fixed and released; remove it (no tracking issue: public application)',
				...(note ? { note } : {}),
				...versionFor(target, fix),
			};
		}
		return { ...base, status: 'waiting', ...(note ? { note } : {}) };
	});
}
