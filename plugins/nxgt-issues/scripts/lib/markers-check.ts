/**
 * `issues.ts markers`: every `Temporary, until <upstream>#<n>` marker in the
 * checkout, judged against the application's tracking issues. A marker is
 * flagged when its fix is released (remove it), when its upstream cannot be
 * resolved (bad reference, repository not found or not allowed), or when no
 * tracking issue of this repository links that upstream issue. The caller
 * exits 1 on any flag: informational, for a CI step or a session.
 */

import { loadSnapshot, readyIssues } from './app-side';
import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { RateLimitedError } from './github';
import {
	describeTarget,
	MARKER_GREP_ARGV,
	type Marker,
	parseMarkers,
} from './markers';
import { formatRepo, type RepoId } from './repo-id';
import { gate, resolvePackage } from './resolve';

export type MarkerStatus = 'ready' | 'unresolvable' | 'untracked' | 'waiting';

export interface MarkerReport {
	readonly file: string;
	readonly line: number;
	readonly upstream: string;
	readonly status: MarkerStatus;
	readonly detail?: string;
	readonly version?: string;
}

type Resolution = { repo: RepoId } | { problem: string };

/** The upstream repository of a marker: `owner/repo` as written, an npm name through the resolve logic (and its caches). */
async function resolveMarker(
	ctx: CliContext,
	marker: Marker,
): Promise<Resolution> {
	const { target } = marker;
	try {
		if (target.kind === 'package') {
			const resolved = await resolvePackage(ctx, target.name);
			return resolved.ok
				? { repo: resolved.repo }
				: { problem: `${resolved.reason}: ${resolved.hint}` };
		}
		const gated = await gate(ctx, describeTarget(target), target.repo);
		return 'ok' in gated
			? { problem: `${gated.reason}: ${gated.hint}` }
			: { repo: gated.repo };
	} catch (error) {
		if (error instanceof RateLimitedError) throw error;
		return { problem: error instanceof Error ? error.message : String(error) };
	}
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function checkMarkers(
	ctx: CliContext,
	markers: readonly Marker[],
	snapshot: Parameters<typeof readyIssues>[0],
): Promise<MarkerReport[]> {
	const ready = readyIssues(snapshot);
	const resolved = new Map<string, Resolution>();
	const reports: MarkerReport[] = [];
	for (const marker of markers) {
		const written = `${describeTarget(marker.target)}#${marker.number}`;
		const base = { file: marker.file, line: marker.line, upstream: written };
		const key = describeTarget(marker.target).toLowerCase();
		let resolution = resolved.get(key);
		if (!resolution) {
			resolution = await resolveMarker(ctx, marker);
			resolved.set(key, resolution);
		}
		if ('problem' in resolution) {
			reports.push({
				...base,
				status: 'unresolvable',
				detail: resolution.problem,
			});
			continue;
		}
		const upstream = `${formatRepo(resolution.repo)}#${marker.number}`;
		const tracked = snapshot.tracking.some((t) => same(t.upstream, upstream));
		const done = ready.find((issue) => same(issue.upstream, upstream));
		if (done) {
			reports.push({
				...base,
				status: 'ready',
				detail: `fixed and released; remove it (tracking #${done.tracking})`,
				...(done.version ? { version: done.version } : {}),
			});
		} else if (tracked) {
			reports.push({ ...base, status: 'waiting' });
		} else {
			const detail = `no tracking issue of this repository links ${upstream}`;
			reports.push({ ...base, status: 'untracked', detail });
		}
	}
	return reports;
}

/** `issues.ts markers [--json]`: exit 1 when any marker is flagged, 0 otherwise. */
export async function markersCommand(
	ctx: CliContext,
	json: boolean,
): Promise<ExitCode> {
	const grep = await ctx.runner.run([...MARKER_GREP_ARGV], { cwd: ctx.cwd });
	// git grep: 1 = no match; anything else is a failure (not a git checkout…).
	if (grep.code > 1) {
		ctx.err(`git grep failed: ${grep.stderr.trim().slice(0, 200)}`);
		return EXIT.failed;
	}
	const markers = grep.code === 0 ? parseMarkers(grep.stdout) : [];
	let reports: MarkerReport[] = [];
	if (markers.length > 0) {
		const snapshot = await loadSnapshot(ctx);
		if ('exit' in snapshot) return snapshot.exit;
		try {
			reports = await checkMarkers(ctx, markers, snapshot);
		} catch (error) {
			if (!(error instanceof RateLimitedError)) throw error;
			ctx.err(error.message);
			return EXIT.rateLimited;
		}
	}
	const flagged = reports.filter((report) => report.status !== 'waiting');
	if (json) {
		ctx.out(JSON.stringify(reports, null, 2));
	} else if (reports.length === 0) {
		ctx.out('no markers: nothing waits for an upstream fix.');
	} else {
		for (const r of reports) {
			const detail = r.detail ? `: ${r.detail}` : '';
			ctx.out(`${r.file}:${r.line} ${r.status} ${r.upstream}${detail}`);
		}
		ctx.out(`${flagged.length} of ${reports.length} marker(s) flagged.`);
	}
	return flagged.length > 0 ? EXIT.flagged : EXIT.ok;
}
