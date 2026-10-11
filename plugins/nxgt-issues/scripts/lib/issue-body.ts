/**
 * The text of every issue and comment the plugin writes, with the hidden HTML
 * comments later runs key on: `fp` (duplicate fingerprint), `upstream` (the
 * issue a tracking issue follows), `deps` (the rolling dependencies issue) and
 * `fixed` (the release comment, so it is posted once).
 */

import { fingerprintMarker } from './fingerprint';
import { formatIssueRef, type IssueRef, upstreamMarker } from './refs';
import { formatRepo, type RepoId } from './repo-id';

export interface PackageIssueInput {
	readonly fingerprint: string;
	readonly summary: string;
	/** Versions involved, by package name. */
	readonly versions: Readonly<Record<string, string>>;
	readonly expected: string;
	readonly actual: string;
	readonly repro: string;
	readonly workaround?: string | undefined;
}

const versionLines = (versions: Readonly<Record<string, string>>): string =>
	Object.entries(versions)
		.map(([name, version]) => `- \`${name}\` ${version}`)
		.join('\n');

/** The issue filed on the package's repository: anonymous by construction. */
export function packageIssueBody(input: PackageIssueInput): string {
	const sections = [
		input.summary.trim(),
		`## Versions\n\n${versionLines(input.versions)}`,
		`## Expected\n\n${input.expected.trim()}`,
		`## Actual\n\n${input.actual.trim()}`,
		`## Reproduction\n\n${input.repro.trim()}`,
	];
	if (input.workaround?.trim()) {
		sections.push(`## Workaround\n\n${input.workaround.trim()}`);
	}
	sections.push(
		fingerprintMarker(input.fingerprint),
		'_Filed by `nxgt-issues` on behalf of a consumer._',
	);
	return `${sections.join('\n\n')}\n`;
}

export interface TrackingMarker {
	readonly file: string;
	readonly line: number;
}

export interface TrackingIssueInput {
	readonly upstream: { readonly repo: RepoId; readonly number: number };
	readonly packageName: string;
	readonly summary: string;
	readonly markers: readonly TrackingMarker[];
}

/** The private issue in the application's repository that follows an upstream one. */
export function trackingIssueBody(input: TrackingIssueInput): string {
	const markers =
		input.markers.length > 0
			? input.markers.map((m) => `- \`${m.file}:${m.line}\``).join('\n')
			: '- none yet';
	return `${[
		`Tracks ${formatRepo(input.upstream.repo)}#${input.upstream.number} (\`${input.packageName}\`).`,
		input.summary.trim(),
		`## Markers\n\nEach carries \`// Temporary, until ${input.packageName}#${input.upstream.number}\`.\n\n${markers}`,
		upstreamMarker(input.upstream),
	].join('\n\n')}\n`;
}

export interface DependencyRow {
	readonly name: string;
	readonly current: string;
	readonly latest: string;
}

export const DEPS_MARKER = '<!-- nxgt-issues:deps -->';

/** The one rolling issue listing dependencies behind their latest version. */
export function dependenciesIssueBody(rows: readonly DependencyRow[]): string {
	const table = [
		'| dependency | used | latest |',
		'| --- | --- | --- |',
		...rows.map(
			(row) => `| \`${row.name}\` | ${row.current} | ${row.latest} |`,
		),
	].join('\n');
	return `${[
		'Dependencies this package declares that are behind their latest release.',
		table,
		DEPS_MARKER,
	].join('\n\n')}\n`;
}

export interface DuplicateCommentInput {
	readonly versions: Readonly<Record<string, string>>;
	readonly note?: string | undefined;
}

/** The comment added to an existing issue when another consumer hits it. */
export function duplicateComment(input: DuplicateCommentInput): string {
	const lines = [
		'Another consumer hit this.',
		`Versions:\n\n${versionLines(input.versions)}`,
	];
	if (input.note?.trim()) lines.push(input.note.trim());
	return `${lines.join('\n\n')}\n`;
}

export const fixedMarker = (pkg: string, version: string): string =>
	`<!-- nxgt-issues:fixed=${pkg}@${version} -->`;

/** The release comment: "Fixed in <pkg>@<v> (#PR)", marked so it is posted once. */
export function fixedComment(
	pkg: string,
	version: string,
	pr: IssueRef | number,
): string {
	const ref = typeof pr === 'number' ? `#${pr}` : formatIssueRef(pr);
	return `Fixed in ${pkg}@${version} (${ref}).\n\n${fixedMarker(pkg, version)}\n`;
}

export const adoptedComment = (pr: number): string => `Adopted in #${pr}.\n`;
