/**
 * `issues.ts track`: the private tracking issue in the application's own
 * repository, labelled `upstream`, carrying the `<!-- nxgt-issues:upstream=
 * o/r#n -->` marker and the list of `// Temporary, until <pkg>#<n>` markers
 * (read with `git grep` when the input gives none). The application's
 * repository must be private: a public one would link the application to the
 * anonymous upstream issue (owner decision Q5). One tracking issue per
 * upstream issue: a second run refreshes its body.
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { exitForError } from './filing';
import { createIssue, editIssueBody, issuesWithLabel } from './github-issues';
import { type TrackingMarker, trackingIssueBody } from './issue-body';
import { ensureLabels } from './labels';
import { describeTarget, MARKER_GREP_ARGV, parseMarkers } from './markers';
import { parseIssueRef, upstreamRef } from './refs';
import {
	allowedOwners,
	formatRepo,
	isAllowedOwner,
	type RepoId,
	repoOfDirectory,
	sameRepo,
} from './repo-id';
import { gateFacts } from './resolve';

export interface TrackInput {
	readonly upstream: { readonly repo: RepoId; readonly number: number };
	readonly packageName: string;
	readonly title: string;
	readonly summary: string;
	readonly markers?: readonly TrackingMarker[] | undefined;
}

type Fields = Record<string, unknown>;

/** `{ upstream: "o/r#n", package, title, summary, markers?: [{ file, line }] }`. */
export function parseTrackInput(raw: string): TrackInput | { problem: string } {
	let o: Fields;
	try {
		o = JSON.parse(raw) as Fields;
	} catch {
		return { problem: 'stdin is not valid JSON' };
	}
	const ref =
		typeof o['upstream'] === 'string'
			? parseIssueRef(o['upstream'])
			: undefined;
	if (!ref?.repo) return { problem: '"upstream" must be "owner/repo#n"' };
	const [pkg, title, summary] = [o['package'], o['title'], o['summary']];
	if (
		typeof pkg !== 'string' ||
		typeof title !== 'string' ||
		typeof summary !== 'string'
	) {
		return { problem: '"package", "title" and "summary" must be strings' };
	}
	const markers = Array.isArray(o['markers'])
		? (o['markers'] as Fields[])
				.filter(
					(m) =>
						typeof m?.['file'] === 'string' && typeof m['line'] === 'number',
				)
				.map((m) => ({ file: m['file'] as string, line: m['line'] as number }))
		: undefined;
	return {
		upstream: { repo: ref.repo, number: ref.number },
		packageName: pkg,
		title,
		summary,
		markers,
	};
}

/** The markers in the checkout that wait for this upstream issue. */
export async function findMarkers(
	ctx: CliContext,
	input: TrackInput,
): Promise<TrackingMarker[]> {
	const result = await ctx.runner.run([...MARKER_GREP_ARGV], { cwd: ctx.cwd });
	const repo = formatRepo(input.upstream.repo).toLowerCase();
	return parseMarkers(result.code === 0 ? result.stdout : '')
		.filter((marker) => marker.number === input.upstream.number)
		.filter((marker) => {
			const target = describeTarget(marker.target).toLowerCase();
			return target === input.packageName.toLowerCase() || target === repo;
		})
		.map(({ file, line }) => ({ file, line }));
}

async function appRepo(ctx: CliContext): Promise<RepoId | string> {
	const app = repoOfDirectory(ctx.cwd);
	if (!app) return 'this directory has no GitHub `origin`';
	if (!isAllowedOwner(app.owner, allowedOwners(ctx.env))) {
		return `${formatRepo(app)} does not belong to an allowed owner (NXGT_ISSUES_OWNERS)`;
	}
	const facts = await gateFacts(ctx, app);
	if (!facts.private) {
		return `${formatRepo(app)} is public: a tracking issue there would link it to the anonymous upstream issue`;
	}
	if (!facts.hasIssues) return `issues are turned off on ${formatRepo(app)}`;
	return app;
}

export async function track(
	ctx: CliContext,
	input: TrackInput,
): Promise<ExitCode> {
	const app = await appRepo(ctx);
	if (typeof app === 'string') {
		ctx.out(`refused: ${app}; no tracking issue was opened.`);
		return EXIT.refusedGate;
	}
	const markers = input.markers ?? (await findMarkers(ctx, input));
	const body = trackingIssueBody({ ...input, markers });
	const existing = (await issuesWithLabel(ctx, app, 'upstream')).find(
		(issue) => {
			const ref = upstreamRef(issue.body);
			return (
				ref &&
				ref.number === input.upstream.number &&
				sameRepo(ref.repo, input.upstream.repo)
			);
		},
	);
	if (existing) {
		if (existing.body.trim() !== body.trim()) {
			await editIssueBody(ctx, app, existing.number, body);
		}
		ctx.out(`tracking ${existing.url} (${markers.length} marker(s))`);
		return EXIT.ok;
	}
	await ensureLabels(ctx, app, ['upstream']);
	const ref = `${input.packageName}#${input.upstream.number}`;
	const url = await createIssue(ctx, app, {
		title: `Upstream ${ref}: ${input.title}`,
		body,
		labels: ['upstream'],
	});
	ctx.out(`tracking ${url} (${markers.length} marker(s))`);
	return EXIT.ok;
}

export async function trackCommand(ctx: CliContext): Promise<ExitCode> {
	const input = parseTrackInput(await ctx.stdin());
	if ('problem' in input) {
		ctx.err(`track: ${input.problem}`);
		return EXIT.usage;
	}
	try {
		return await track(ctx, input);
	} catch (error) {
		return exitForError(ctx, error);
	}
}
