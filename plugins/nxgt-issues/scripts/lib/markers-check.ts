/**
 * `issues.ts markers`: every `Temporary, until <upstream>#<n>` marker in the
 * checkout, judged against the application's tracking issues. A marker is
 * flagged when its fix is released (remove it), when its upstream cannot be
 * resolved (bad reference, repository not found or not allowed), or, in a
 * private application, when no open tracking issue of this repository links
 * that upstream issue. A public application has no tracking issues (they
 * would tie it to the anonymous report): its markers read the upstream issue
 * directly. A rate limit or a gh failure is no verdict: it exits 5 or 6.
 */

import { loadSnapshot } from './app-side';
import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { adoptReady, releaseFix } from './context';
import { exitForError } from './filing';
import {
	describeTarget,
	type Marker,
	markerGrepArgv,
	parseMarkers,
} from './markers';
import { lookUpPublic } from './markers-public';
import {
	type Resolution,
	resolveCached,
	same,
	trackedByName,
} from './markers-resolve';
import { type Judged, type MarkerReport, versionFor } from './markers-types';
import { repoOfDirectory } from './repo-id';
import { gateFacts } from './resolve';
import type { Snapshot } from './snapshot';
import { cleanJson } from './untrusted';

const MAX_ISSUE_NUMBER = 2 ** 31 - 1;

async function judge(
	ctx: CliContext,
	markers: readonly Marker[],
	snapshot: Snapshot,
): Promise<Judged[]> {
	const ready = adoptReady(snapshot.tracking);
	const resolved = new Map<string, Resolution>();
	const out: Judged[] = [];
	for (const marker of markers) {
		const written = `${describeTarget(marker.target)}#${marker.number}`;
		const base = { file: marker.file, line: marker.line, upstream: written };
		const known = trackedByName(snapshot, marker);
		const resolution = known ?? (await resolveCached(ctx, marker, resolved));
		if ('problem' in resolution || marker.number > MAX_ISSUE_NUMBER) {
			const detail =
				'problem' in resolution
					? resolution.problem
					: 'issue number out of range';
			out.push({
				report: { ...base, status: 'unresolvable', detail },
				target: marker.target,
			});
			continue;
		}
		const upstream = known
			? known.upstream
			: `${resolution.repo}#${marker.number}`;
		const done = ready.find((issue) => same(issue.upstream, upstream));
		const tracked = snapshot.tracking.some((t) => same(t.upstream, upstream));
		const unreadable = snapshot.tracking.some(
			(t) => same(t.upstream, upstream) && t.upstreamUnknown,
		);
		if (unreadable) {
			const detail = `${upstream} could not be read; try again`;
			out.push({
				report: { ...base, status: 'unreadable', detail },
				upstream,
				target: marker.target,
			});
		} else if (done) {
			const fix = releaseFix(done);
			const detail = `fixed and released; remove it (tracking #${done.number})`;
			const version = versionFor(marker.target, fix);
			const report: MarkerReport = {
				...base,
				status: 'ready',
				detail,
				...version,
			};
			out.push({ report, upstream, target: marker.target });
		} else {
			const detail = `no open tracking issue of this repository links ${upstream}`;
			const report: MarkerReport = tracked
				? { ...base, status: 'waiting' }
				: { ...base, status: 'untracked', detail };
			out.push({ report, upstream, target: marker.target });
		}
	}
	return out;
}

export async function checkMarkers(
	ctx: CliContext,
	markers: readonly Marker[],
	snapshot: Snapshot,
): Promise<MarkerReport[]> {
	const judged = await judge(ctx, markers, snapshot);
	if (!judged.some((j) => j.report.status === 'untracked')) {
		return judged.map((j) => j.report);
	}
	const app = repoOfDirectory(ctx.cwd);
	const facts = app ? await gateFacts(ctx, app, { fresh: true }) : undefined;
	return facts && !facts.private
		? lookUpPublic(ctx, judged)
		: judged.map((j) => j.report);
}

function print(
	ctx: CliContext,
	reports: readonly MarkerReport[],
	flagged: number,
	unreadable: number,
) {
	if (reports.length === 0) {
		ctx.out('no markers: nothing waits for an upstream fix.');
		return;
	}
	for (const r of reports) {
		const detail = r.detail ? `: ${r.detail}` : '';
		const note = r.note ? ` (${r.note})` : '';
		ctx.out(`${r.file}:${r.line} ${r.status} ${r.upstream}${detail}${note}`);
	}
	const apart = unreadable > 0 ? `; ${unreadable} unreadable` : '';
	ctx.out(`${flagged} of ${reports.length} marker(s) flagged${apart}.`);
}

/**
 * `issues.ts markers [--json] [--exclude <pathspec>]…`: exit 6 when a marker is
 * `unreadable` (GitHub could not read its upstream issue; the rest is still
 * printed), else 1 when any marker is flagged, else 0.
 */
export async function markersCommand(
	ctx: CliContext,
	json: boolean,
	excludes: readonly string[] = [],
): Promise<ExitCode> {
	let reports: MarkerReport[] = [];
	try {
		const grep = await ctx.runner.run(markerGrepArgv(excludes), {
			cwd: ctx.cwd,
		});
		// git grep: 1 = no match; anything else is a failure (not a git checkout…).
		if (grep.code > 1) {
			ctx.err(`git grep failed: ${grep.stderr.trim().slice(0, 200)}`);
			return EXIT.failed;
		}
		const markers = grep.code === 0 ? parseMarkers(grep.stdout) : [];
		if (markers.length > 0) {
			const snapshot = await loadSnapshot(ctx);
			if ('exit' in snapshot) return snapshot.exit;
			reports = await checkMarkers(ctx, markers, snapshot);
		}
	} catch (error) {
		return exitForError(ctx, error);
	}
	// An unreadable marker has no verdict: it is counted apart, never as flagged.
	const unreadable = reports.filter((r) => r.status === 'unreadable').length;
	const flagged = reports.filter(
		(r) => r.status !== 'waiting' && r.status !== 'unreadable',
	).length;
	if (json) ctx.out(JSON.stringify(cleanJson(reports), null, 2));
	else print(ctx, reports, flagged, unreadable);
	// A marker GitHub could not read has no verdict: the run says so (6) before it says "flagged".
	if (unreadable > 0) {
		ctx.err('nxgt-issues: some upstream issues could not be read; run again.');
		return EXIT.failed;
	}
	return flagged > 0 ? EXIT.flagged : EXIT.ok;
}
