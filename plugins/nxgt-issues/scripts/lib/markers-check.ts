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
	type Judged,
	MarkerLookupError,
	type MarkerReport,
	versionFor,
} from './markers-types';
import { formatRepo, repoOfDirectory } from './repo-id';
import { gate, gateFacts, type RefusalReason, resolvePackage } from './resolve';
import type { Snapshot } from './snapshot';
import { cleanJson } from './untrusted';

const MAX_ISSUE_NUMBER = 2 ** 31 - 1;

const HINTS: Record<RefusalReason, string> = {
	'invalid-name': 'not an npm package name; write <package>#n or owner/repo#n',
	'unknown-package': 'neither on the registry nor installed; fix the name',
	'no-repository-field': 'the package declares no GitHub repository',
	'not-owner': 'its repository does not belong to an allowed owner',
	'not-found': 'gh cannot see the repository: renamed, deleted or not visible',
	'issues-disabled': 'issues are off there, nothing will be fixed',
	archived: 'the repository is archived, nothing will be fixed',
	'rate-limited': 'GitHub rate limit',
	unreachable: 'gh failed',
};

type Resolution = { repo: string } | { problem: string };

/** The upstream repository of a marker: `owner/repo` as written, an npm name through the resolve logic (and its caches). */
async function resolveMarker(
	ctx: CliContext,
	marker: Marker,
): Promise<Resolution> {
	const { target } = marker;
	const result =
		target.kind === 'package'
			? await resolvePackage(ctx, target.name)
			: await gate(ctx, describeTarget(target), target.repo);
	if (!('ok' in result) || result.ok) {
		return { repo: formatRepo(result.repo) };
	}
	const refused = result;
	if (refused.reason === 'rate-limited') {
		throw new MarkerLookupError('GitHub rate limit reached.', EXIT.rateLimited);
	}
	if (refused.reason === 'unreachable') {
		throw new MarkerLookupError(
			'gh failed; run `gh auth status`.',
			EXIT.failed,
		);
	}
	return { problem: `${refused.reason}: ${HINTS[refused.reason]}` };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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
		const key = describeTarget(marker.target).toLowerCase();
		let resolution = resolved.get(key);
		if (!resolution) {
			resolution = await resolveMarker(ctx, marker);
			resolved.set(key, resolution);
		}
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
		const upstream = `${resolution.repo}#${marker.number}`;
		const done = ready.find((issue) => same(issue.upstream, upstream));
		const tracked = snapshot.tracking.some((t) => same(t.upstream, upstream));
		if (done) {
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
	ctx.out(`${flagged} of ${reports.length} marker(s) flagged.`);
}

/** `issues.ts markers [--json] [--exclude <pathspec>]…`: exit 1 when any marker is flagged, 0 otherwise. */
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
	const flagged = reports.filter(
		(report) => report.status !== 'waiting',
	).length;
	if (json) ctx.out(JSON.stringify(cleanJson(reports), null, 2));
	else print(ctx, reports, flagged);
	return flagged > 0 ? EXIT.flagged : EXIT.ok;
}
