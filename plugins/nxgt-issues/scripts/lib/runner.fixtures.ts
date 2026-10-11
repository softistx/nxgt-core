/**
 * A scripted fake `Runner` for specs: it answers from a list of rules, records
 * every call, and fails the spec on a call no rule covers.
 */

import type { Runner, RunOptions, RunResult } from './runner';

export interface RunCall {
	readonly argv: readonly string[];
	readonly options: RunOptions;
}

export interface FakeRunner extends Runner {
	readonly calls: RunCall[];
	readonly fetches: string[];
}

export interface RunRule {
	/** The call matches when its argv starts with these words. */
	readonly argv: readonly string[];
	readonly result?: Partial<RunResult>;
	/** Instead of a result: make the call throw (a timeout, a missing binary). */
	readonly throws?: string;
}

export interface FetchRule {
	/** The call matches when the URL contains this text. */
	readonly url: string;
	readonly json?: unknown;
	readonly throws?: string;
}

export function fakeRunner(
	rules: { run?: readonly RunRule[]; fetch?: readonly FetchRule[] } = {},
): FakeRunner {
	const calls: RunCall[] = [];
	const fetches: string[] = [];
	return {
		calls,
		fetches,
		async run(argv, options = {}) {
			calls.push({ argv, options });
			const rule = rules.run?.find((candidate) =>
				candidate.argv.every((word, index) => argv[index] === word),
			);
			if (!rule) throw new Error(`fake runner: no rule for ${argv.join(' ')}`);
			if (rule.throws) throw new Error(rule.throws);
			return { code: 0, stdout: '', stderr: '', ...rule.result };
		},
		async fetchJson(url) {
			fetches.push(url);
			const rule = rules.fetch?.find((candidate) =>
				url.includes(candidate.url),
			);
			if (!rule) throw new Error(`fake runner: no rule for fetch ${url}`);
			if (rule.throws) throw new Error(rule.throws);
			return rule.json;
		},
	};
}
