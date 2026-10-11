/** What `markers` reports about each marker. */

import type { ExitCode } from './cli-context';
import type { MarkerTarget } from './markers';

/** `unreadable`: GitHub could not read the upstream issue just now; the run exits 6. */
export type MarkerStatus =
	| 'ready'
	| 'unreadable'
	| 'unresolvable'
	| 'untracked'
	| 'waiting';

export interface MarkerReport {
	readonly file: string;
	readonly line: number;
	readonly upstream: string;
	readonly status: MarkerStatus;
	readonly detail?: string;
	readonly note?: string;
	readonly version?: string;
}

/** A lookup that gave no verdict (rate limit, gh failure): the run stops with this exit code. */
export class MarkerLookupError extends Error {
	constructor(
		message: string,
		readonly exit: ExitCode,
	) {
		super(message);
	}
}

export interface Judged {
	readonly report: MarkerReport;
	/** `owner/repo#n` when the upstream resolved. */
	readonly upstream?: string;
	readonly target: MarkerTarget;
}

/**
 * The release version, when the comment is about what the marker waits for:
 * a package marker needs the comment's package to be the same; an
 * `owner/repo#n` marker names no package, so the version stays.
 */
export function versionFor(
	target: MarkerTarget,
	fix: { package: string; version: string } | undefined,
): { version: string } | Record<string, never> {
	if (!fix) return {};
	if (
		target.kind === 'package' &&
		target.name.toLowerCase() !== fix.package.toLowerCase()
	) {
		return {};
	}
	return { version: fix.version };
}
