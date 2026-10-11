/**
 * The one rolling `dependencies` issue per package (owner decision Q14): a
 * report edits its table, never files a second issue; the package side closes
 * it when the table is empty, and a later report reopens it with only the new
 * rows. The issue is found by its `<!-- nxgt-issues:deps -->` marker among the
 * `dependencies`-labelled issues. The rendered body is scrubbed like any other.
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { allowFor, checkTexts, printScrubRefusal } from './filing';
import {
	createIssue,
	editIssueBody,
	issuesWithLabel,
	removeIssueLabel,
	reopenIssue,
} from './github-issues';
import {
	DEPS_MARKER,
	type DependencyRow,
	dependenciesIssueBody,
} from './issue-body';
import { ensureLabels, hasLabel, LABELS } from './labels';
import type { Resolved } from './resolve';
import type { DenyList } from './scrub';

export const DEPS_TITLE = 'Dependencies behind their latest release';

const ROW = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/;

/** The rows of a rolling issue's table. */
export function parseDepsTable(body: string): DependencyRow[] {
	const rows: DependencyRow[] = [];
	for (const line of body.split('\n')) {
		const match = ROW.exec(line.trim());
		if (match?.[1] && match[2] && match[3]) {
			rows.push({ name: match[1], current: match[2], latest: match[3] });
		}
	}
	return rows;
}

/** The old rows updated by the new ones, by name, sorted. */
export function mergeRows(
	old: readonly DependencyRow[],
	next: readonly DependencyRow[],
): DependencyRow[] {
	const byName = new Map(old.map((row) => [row.name, row]));
	for (const row of next) byName.set(row.name, row);
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertRollingIssue(
	ctx: CliContext,
	resolved: Resolved,
	rows: readonly DependencyRow[],
	denyList: DenyList,
): Promise<ExitCode> {
	const repo = resolved.repo;
	const rolling = (await issuesWithLabel(ctx, repo, LABELS.dependencies.name))
		.filter((issue) => issue.body.includes(DEPS_MARKER))
		.sort((a, b) => a.number - b.number)[0];
	const open = rolling?.state.toUpperCase() === 'OPEN';
	const base = rolling && open ? parseDepsTable(rolling.body) : [];
	const checked = checkTexts(
		{ body: dependenciesIssueBody(mergeRows(base, rows)) },
		{ cwd: ctx.cwd, denyList, allow: allowFor(resolved, ctx.cwd) },
	);
	if (!checked.ok) return printScrubRefusal(ctx, checked);
	const body = checked.texts.body;
	if (!rolling) {
		const labels = [LABELS.dependencies.name, LABELS['consumer-report'].name];
		await ensureLabels(ctx, repo, labels);
		const url = await createIssue(ctx, repo, {
			title: DEPS_TITLE,
			body,
			labels,
		});
		ctx.out(`filed ${url}`);
		return EXIT.ok;
	}
	// An open issue holding `released` (a reopen whose removal failed, or a hand reopen) would make the next release report "reopened, fix did not hold".
	const holdsReleased = hasLabel(
		(rolling.labels ?? []).map((label) => label.name),
		'released',
	);
	if (open && holdsReleased) {
		await removeIssueLabel(ctx, repo, rolling.number, LABELS.released.name);
	}
	if (open && rolling.body.trim() === body.trim()) {
		ctx.out(`unchanged ${rolling.url} (the rolling issue already lists these)`);
		return EXIT.ok;
	}
	await editIssueBody(ctx, repo, rolling.number, body);
	if (!open) {
		await reopenIssue(ctx, repo, rolling.number);
		if (holdsReleased) {
			await removeIssueLabel(ctx, repo, rolling.number, LABELS.released.name);
		}
	}
	ctx.out(`${open ? 'updated' : 'reopened'} ${rolling.url}`);
	return EXIT.ok;
}
