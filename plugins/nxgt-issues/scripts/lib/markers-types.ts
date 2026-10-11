/** What `markers` reports about each marker. */

import type { ExitCode } from './cli-context';

export type MarkerStatus = 'ready' | 'unresolvable' | 'untracked' | 'waiting';

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
}
