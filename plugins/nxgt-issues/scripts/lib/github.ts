/**
 * Every GitHub call the plugin makes, as `gh` invocations through the runner.
 * A refusal by the API for rate (HTTP 403 or 429, or a message that says
 * "rate limit") stores `rateLimitedUntil` in `<home>/cache/rate-limit.json`;
 * until then every call throws `RateLimitedError` without spawning anything,
 * so one throttled run does not turn into a burst of failing ones.
 */

import { join } from 'node:path';
import { readEntry, writeEntry } from './cache';
import { formatRepo, type RepoId } from './repo-id';
import type { Runner } from './runner';

/** How long a rate-limit refusal stops every call. */
export const RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000;

export class RateLimitedError extends Error {
	constructor(readonly until: number) {
		super(
			`GitHub rate limit reached; nxgt-issues makes no call until ${new Date(until).toISOString()}.`,
		);
	}
}

export class GhError extends Error {
	constructor(
		readonly argv: readonly string[],
		readonly code: number,
		readonly stderr: string,
	) {
		super(
			`gh ${argv.slice(0, 3).join(' ')} failed (${code}): ${stderr.trim().slice(0, 300)}`,
		);
	}
}

export interface GhContext {
	readonly runner: Runner;
	readonly home: string;
	readonly now: () => number;
	readonly cwd?: string;
}

const RATE_LIMITED = /rate limit|HTTP 429|HTTP 403|status 429|status 403/i;

const rateLimitPath = (home: string): string =>
	join(home, 'cache', 'rate-limit.json');

/** The instant calls may resume, when a rate limit is in force. */
export function rateLimitedUntil(
	home: string,
	now: number,
): number | undefined {
	const entry = readEntry<{ until?: unknown }>(
		rateLimitPath(home),
		now,
		Number.POSITIVE_INFINITY,
	);
	const until = entry?.data.until;
	return typeof until === 'number' && until > now ? until : undefined;
}

/** Runs `gh <args>`; throws `GhError` on failure, `RateLimitedError` on a rate refusal. */
export async function gh(
	ctx: GhContext,
	args: readonly string[],
	stdin?: string,
): Promise<string> {
	const paused = rateLimitedUntil(ctx.home, ctx.now());
	if (paused !== undefined) throw new RateLimitedError(paused);
	const result = await ctx.runner.run(['gh', ...args], {
		...(stdin === undefined ? {} : { stdin }),
		...(ctx.cwd ? { cwd: ctx.cwd } : {}),
	});
	if (result.code === 0) return result.stdout;
	if (RATE_LIMITED.test(result.stderr)) {
		const until = ctx.now() + RATE_LIMIT_PAUSE_MS;
		writeEntry(rateLimitPath(ctx.home), { until }, ctx.now());
		throw new RateLimitedError(until);
	}
	throw new GhError(args, result.code, result.stderr);
}

export async function ghJson<T>(
	ctx: GhContext,
	args: readonly string[],
): Promise<T> {
	const out = await gh(ctx, args);
	try {
		return JSON.parse(out) as T;
	} catch {
		throw new GhError(
			args,
			0,
			`unparseable JSON from gh: ${out.slice(0, 100)}`,
		);
	}
}

export interface RepoFacts {
	readonly fullName: string;
	readonly hasIssues: boolean;
	readonly archived: boolean;
	readonly private: boolean;
}

/** `gh api repos/o/r`: what the gate needs. */
export async function repoFacts(
	ctx: GhContext,
	id: RepoId,
): Promise<RepoFacts> {
	const raw = await ghJson<Record<string, unknown>>(ctx, [
		'api',
		`repos/${formatRepo(id)}`,
	]);
	return {
		fullName:
			typeof raw['full_name'] === 'string' ? raw['full_name'] : formatRepo(id),
		hasIssues: raw['has_issues'] === true,
		archived: raw['archived'] === true,
		private: raw['private'] === true,
	};
}
