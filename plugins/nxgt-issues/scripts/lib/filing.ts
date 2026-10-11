/**
 * The steps every public write shares: scrub each RENDERED text (title, body,
 * comment, search words) against the filing's deny-list and refuse on any
 * hit, print a refusal by its terms and credential keywords (never a value),
 * and turn a thrown error into an exit code.
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { DenyListIncomplete } from './deny-sources';
import { GhError, RateLimitedError } from './github';
import { formatRepo } from './repo-id';
import type { Refused, Resolved } from './resolve';
import { type DenyList, scrub } from './scrub';

export type Checked<K extends string> =
	| { readonly ok: true; readonly texts: Readonly<Record<K, string>> }
	| {
			readonly ok: false;
			readonly denied: string[];
			readonly secrets: string[];
	  };

/** The terms a filing on `resolved` may contain although denied: its own package and repository. */
export const allowFor = (resolved: Resolved): string[] => [
	resolved.package,
	resolved.repo.repo,
	formatRepo(resolved.repo),
];

/** Scrubs every text; refuses when any one of them is refused. */
export function checkTexts<K extends string>(
	texts: Readonly<Record<K, string>>,
	options: { cwd: string; denyList: DenyList; allow: readonly string[] },
): Checked<K> {
	const denied = new Set<string>();
	const secrets = new Set<string>();
	const out = {} as Record<K, string>;
	for (const key of Object.keys(texts) as K[]) {
		const result = scrub(texts[key], options);
		for (const term of result.denied) denied.add(term);
		for (const keyword of result.secrets) secrets.add(keyword);
		out[key] = result.text;
	}
	if (denied.size > 0 || secrets.size > 0) {
		return { ok: false, denied: [...denied], secrets: [...secrets] };
	}
	return { ok: true, texts: out };
}

export function printScrubRefusal(
	ctx: CliContext,
	refusal: { denied: readonly string[]; secrets: readonly string[] },
): ExitCode {
	ctx.out('refused: the text is not anonymous; nothing was filed.');
	if (refusal.denied.length > 0) {
		ctx.out(`  remove these terms: ${refusal.denied.join(', ')}`);
	}
	if (refusal.secrets.length > 0) {
		ctx.out(
			`  remove the credential values after: ${refusal.secrets.join(', ')} (use a placeholder such as <redacted>)`,
		);
	}
	ctx.out(
		'  Rewrite the reproduction from scratch with generic names, then run file again.',
	);
	return EXIT.refusedScrub;
}

export function printGateRefusal(ctx: CliContext, refused: Refused): ExitCode {
	const where = refused.repo ? ` (${formatRepo(refused.repo)})` : '';
	ctx.out(`refused: ${refused.reason}${where}; nothing was filed.`);
	ctx.out(`  ${refused.hint}`);
	return EXIT.refusedGate;
}

export function exitForError(ctx: CliContext, error: unknown): ExitCode {
	if (error instanceof RateLimitedError) {
		ctx.out(`rate-limited: ${error.message}`);
		return EXIT.rateLimited;
	}
	if (error instanceof DenyListIncomplete) {
		ctx.out(`refused: ${error.message}; nothing was filed.`);
		return EXIT.refusedScrub;
	}
	const message =
		error instanceof GhError || error instanceof Error
			? error.message
			: String(error);
	ctx.err(`nxgt-issues: ${message}`);
	return EXIT.failed;
}
