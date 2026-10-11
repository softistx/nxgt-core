/**
 * `issues.ts released <pkg@version> [--json] [--dry-run]`: the session
 * fallback of the release step, run from the library's checkout.
 */

import { relative } from 'node:path';
import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { exitForError } from './filing';
import {
	type IssueOutcome,
	type ReleaseReport,
	releasePackage,
} from './release';
import { allowedOwners, isAllowedOwner, repoOfDirectory } from './repo-id';
import { manifestsOf, repoRoot } from './workspaces';

function describeIssue(issue: IssueOutcome, dry: boolean): string {
	if (issue.skipped) {
		return `  #${issue.number}: left to the package it names`;
	}
	const did = [
		issue.labelled ? 'label released' : '',
		issue.closed ? 'close' : '',
		issue.commented ? `comment (#${issue.pr})` : '',
	].filter(Boolean);
	const verb = dry ? 'would ' : '';
	return did.length === 0
		? `  #${issue.number}: already released`
		: `  #${issue.number}: ${verb}${did.join(', ')}`;
}

function render(report: ReleaseReport): string[] {
	const lines = [
		`${report.dryRun ? 'dry run: ' : ''}${report.package}@${report.version} (${report.repo}): ${report.prs.length} PR(s), ${report.issues.length} issue(s)`,
		...report.issues.map((issue) => describeIssue(issue, report.dryRun)),
	];
	if (report.labelCreated) {
		lines.push(
			`  label released: ${report.dryRun ? 'would be created' : 'created'}`,
		);
	}
	lines.push(...report.notes.map((note) => `  note: ${note}`));
	if (report.notify.length > 0) {
		lines.push('notify (tracking issues waiting on this release):');
		for (const n of report.notify)
			lines.push(`  ${n.tracking} ${n.title} -> ${n.upstream}`);
	}
	return lines;
}

/** `pkg@version` split at the last `@` that is not the scope's. */
function parseSpec(spec: string): { pkg: string; version: string } | undefined {
	const at = spec.lastIndexOf('@');
	if (at <= 0 || at === spec.length - 1) return undefined;
	return { pkg: spec.slice(0, at), version: spec.slice(at + 1) };
}

export async function releasedCommand(
	ctx: CliContext,
	spec: string | undefined,
	json: boolean,
	dryRun: boolean,
): Promise<ExitCode> {
	const parsed = spec ? parseSpec(spec) : undefined;
	if (!parsed) {
		ctx.err('usage: issues.ts released <pkg>@<version> [--json] [--dry-run]');
		return EXIT.usage;
	}
	const repo = repoOfDirectory(ctx.cwd);
	const owners = allowedOwners(ctx.env);
	if (!repo || !isAllowedOwner(repo.owner, owners)) {
		ctx.out(
			'refused: this checkout does not belong to an allowed owner; nothing was changed.',
		);
		return EXIT.refusedGate;
	}
	const root = repoRoot(ctx.cwd);
	const manifests = root ? manifestsOf(root) : [];
	// The root is releasable only in a single-package repository (no `workspaces`), and then it is the only sibling-less package.
	const single = (m: { dir: string; data: Record<string, unknown> }) =>
		m.dir !== root || !m.data['workspaces'];
	const manifest = manifests.find((m) => m.name === parsed.pkg && single(m));
	if (!(root && manifest)) {
		ctx.err(
			`nxgt-issues: ${parsed.pkg} is not a workspace package of this checkout`,
		);
		return EXIT.usage;
	}
	try {
		const report = await releasePackage(ctx, {
			repo,
			...parsed,
			dir: relative(root, manifest.dir).replaceAll('\\', '/') || '.',
			siblings: manifests.flatMap((m) =>
				m.name && (m.dir !== root || m === manifest)
					? [{ name: m.name, dir: relative(root, m.dir) || '.' }]
					: [],
			),
			owners,
			dryRun,
		});
		for (const line of json
			? [JSON.stringify(report, null, 2)]
			: render(report)) {
			ctx.out(line);
		}
		for (const warning of report.warnings) ctx.err(`nxgt-issues: ${warning}`);
		return report.warnings.length > 0 ? EXIT.failed : EXIT.ok;
	} catch (error) {
		return exitForError(ctx, error);
	}
}
