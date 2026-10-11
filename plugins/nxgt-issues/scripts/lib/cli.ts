/**
 * The `issues.ts` dispatcher, kept out of the entry file so specs can drive
 * every subcommand with the fake runner:
 *
 *   resolve <pkg> [--json]          the repository a package's issues go to, or the refusal
 *   file [--duplicate-of <n>|--new] [--public-app]  the report (JSON on stdin) filed anonymously
 *   track                           the private tracking issue (JSON on stdin)
 *   deps <pkg> [--file]             the dependencies behind latest; --file updates the rolling issue
 *   sessions <owner/repo> [--json]  live crew sessions that depend on the repository's packages
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { filingDenyList } from './deny-sources';
import { upsertRollingIssue } from './deps';
import { behindDependencies } from './deps-behind';
import { type FileFlags, fileCommand } from './file';
import { exitForError, printGateRefusal } from './filing';
import { formatRepo } from './repo-id';
import { resolvePackage } from './resolve';
import { sessionsCommand } from './sessions';
import { trackCommand } from './track';

export const USAGE = `usage: issues.ts <command>
  resolve <pkg> [--json]
  file [--duplicate-of <n> | --new] [--public-app]   report JSON on stdin
  track                                 tracking JSON on stdin
  deps <pkg> [--file]
  sessions <owner/repo> [--json]`;

async function resolveCommand(ctx: CliContext, pkg: string, json: boolean) {
	const result = await resolvePackage(ctx, pkg);
	if (json) {
		ctx.out(JSON.stringify(result, null, 2));
		return result.ok ? EXIT.ok : EXIT.refusedGate;
	}
	if (!result.ok) return printGateRefusal(ctx, result);
	const versions = [
		result.installed ? `installed ${result.installed}` : undefined,
		result.latest ? `latest ${result.latest}` : undefined,
	].filter(Boolean);
	const visibility = result.private ? 'private' : 'public';
	ctx.out(
		`${pkg} -> ${formatRepo(result.repo)} (${visibility}${versions.length ? `, ${versions.join(', ')}` : ''})`,
	);
	return EXIT.ok;
}

async function depsCommand(ctx: CliContext, pkg: string, file: boolean) {
	try {
		const resolved = await resolvePackage(ctx, pkg);
		if (!resolved.ok) return printGateRefusal(ctx, resolved);
		const rows = await behindDependencies(ctx.runner, pkg);
		if (!file) {
			ctx.out(JSON.stringify(rows, null, 2));
			return EXIT.ok;
		}
		if (rows.length === 0) {
			ctx.out(
				`nothing behind: every dependency of ${pkg} accepts its latest release`,
			);
			return EXIT.ok;
		}
		return await upsertRollingIssue(
			ctx,
			resolved,
			rows,
			await filingDenyList(ctx),
		);
	} catch (error) {
		return exitForError(ctx, error);
	}
}

/** `--duplicate-of <n>` (a positive integer), `--new`, `--public-app`; undefined when invalid. */
export function fileFlags(args: readonly string[]): FileFlags | undefined {
	const index = args.indexOf('--duplicate-of');
	const force = args.includes('--new');
	const publicApp = args.includes('--public-app');
	if (index === -1) return { force, publicApp };
	const duplicateOf = Number(args[index + 1]);
	if (!(Number.isInteger(duplicateOf) && duplicateOf > 0) || force) return;
	return { duplicateOf, publicApp };
}

export async function main(
	ctx: CliContext,
	argv: readonly string[],
): Promise<ExitCode> {
	const [command, ...args] = argv;
	const positional = args.filter(
		(arg, i) => !arg.startsWith('--') && args[i - 1] !== '--duplicate-of',
	);
	const has = (flag: string) => args.includes(flag);
	switch (command) {
		case 'resolve':
			if (!positional[0]) break;
			return resolveCommand(ctx, positional[0], has('--json'));
		case 'file': {
			const flags = fileFlags(args);
			if (!flags) break;
			return fileCommand(ctx, flags);
		}
		case 'track':
			return trackCommand(ctx);
		case 'deps':
			if (!positional[0]) break;
			return depsCommand(ctx, positional[0], has('--file'));
		case 'sessions':
			return sessionsCommand(ctx, positional[0], has('--json'));
	}
	ctx.err(USAGE);
	return EXIT.usage;
}
