/**
 * What every `issues.ts` command runs with. The entry file builds the real
 * one (real runner, process environment, the machine's hostname and home);
 * specs build one around the fake runner and a temporary home.
 */

import type { PidProbe } from './crew-registry';
import type { ResolveContext } from './resolve';

export interface CliContext extends ResolveContext {
	/** The machine's hostname and the user's home folder, both denied in filings. */
	readonly hostname: string;
	readonly homeDir: string;
	readonly stdin: () => Promise<string>;
	readonly out: (line: string) => void;
	readonly err: (line: string) => void;
	readonly probe?: PidProbe | undefined;
}

/** Exit codes, documented in the README. */
export const EXIT = {
	ok: 0,
	usage: 1,
	refusedGate: 2,
	refusedScrub: 3,
	candidates: 4,
	rateLimited: 5,
	failed: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
