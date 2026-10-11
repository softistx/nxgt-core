/**
 * The `issues.ts` dispatcher, kept out of the entry file so specs can drive
 * every subcommand with the fake runner:
 *
 *   resolve <pkg> [--json]          the repository a package's issues go to, or the refusal
 *   file [--duplicate-of <n>|--new] [--public-app]  the report (JSON on stdin) filed anonymously
 *   track                           the private tracking issue (JSON on stdin)
 *   deps <pkg> [--file [--public-app]] the dependencies behind latest; --file updates the rolling issue
 *   sessions <owner/repo> [--json]  live crew sessions that depend on the repository's packages
 *   refresh                         the SessionStart cache of this checkout's repository
 *   ready [--json]                  tracking issues whose upstream fix is released
 *   dashboard [--json]              open issues of the owners' repositories, ranked, and the fixes awaiting release
 *   release-plan <pkg@ver> [--json] what released would do, writing nothing (read-only)
 *   released <pkg@ver> [--json] [--dry-run]  close the issues a release fixed, list the tracking issues to notify
 *   markers [--json] [--exclude <pathspec>]…  `Temporary, until` markers: ready to remove, unresolvable, untracked (exit 1)
 */

import { readyCommand } from './app-side';
import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { dashboardCommand } from './dashboard-command';
import { filingDenyList } from './deny-sources';
import { upsertRollingIssue } from './deps';
import { behindDependencies } from './deps-behind';
import { type FileFlags, fileCommand } from './file';
import { refuseInPublicApp } from './file-checks';
import { exitForError, printGateRefusal } from './filing';
import { markersCommand } from './markers-check';
import { refreshCommand } from './refresh';
import { releasedCommand } from './release-command';
import { formatRepo } from './repo-id';
import { resolvePackage } from './resolve';
import { sessionsCommand } from './sessions';
import { trackCommand } from './track';
import { cleanJson } from './untrusted';

export const USAGE = `usage: issues.ts <command>
  resolve <pkg> [--json]
  file [--duplicate-of <n> | --new] [--public-app]   report JSON on stdin
  track                                 tracking JSON on stdin
  deps <pkg> [--file [--public-app]]
  sessions <owner/repo> [--json]
  refresh                               refresh this checkout's issue cache
  ready [--json]                        fixes released upstream, ready to adopt
  dashboard [--json]                    open issues across the owners' repositories, ranked
  release-plan <pkg@ver> [--json]       what released would do, writing nothing (read-only)
  released <pkg@ver> [--json] [--dry-run]  comment, label and close the issues a published version fixed
  markers [--json] [--exclude <pathspec>]… workaround markers; exit 1 when any is flagged`;

async function resolveCommand(ctx: CliContext, pkg: string, json: boolean) {
	const result = await resolvePackage(ctx, pkg);
	if (json) {
		ctx.out(JSON.stringify(cleanJson(result), null, 2));
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

async function depsCommand(
	ctx: CliContext,
	pkg: string,
	file: boolean,
	publicApp: boolean,
) {
	try {
		// Filing is public: gated like `file`, with the visibility read fresh.
		const refused = file ? await refuseInPublicApp(ctx, publicApp) : undefined;
		if (refused !== undefined) return refused;
		const resolved = await resolvePackage(ctx, pkg);
		if (!resolved.ok) return printGateRefusal(ctx, resolved);
		const rows = await behindDependencies(ctx.runner, pkg);
		if (!file) {
			ctx.out(JSON.stringify(cleanJson(rows), null, 2));
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

/** Every value of a repeatable `--flag <value>` or `--flag=<value>`; undefined when one has none. */
export function optionValues(
	args: readonly string[],
	flag: string,
): string[] | undefined {
	const values: string[] = [];
	for (const [i, arg] of args.entries()) {
		let value: string | undefined;
		if (arg === flag) value = args[i + 1];
		else if (arg.startsWith(`${flag}=`)) value = arg.slice(flag.length + 1);
		else continue;
		if (!value || value.startsWith('--')) return undefined;
		values.push(value);
	}
	return values;
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

/** The flags each command knows, and how many positional words it takes. Anything else is a usage error. */
const SHAPES: Readonly<
	Record<string, { flags: readonly string[]; positional: number }>
> = {
	resolve: { flags: ['--json'], positional: 1 },
	file: { flags: ['--duplicate-of', '--new', '--public-app'], positional: 0 },
	track: { flags: [], positional: 0 },
	deps: { flags: ['--file', '--public-app'], positional: 1 },
	refresh: { flags: [], positional: 0 },
	ready: { flags: ['--json'], positional: 0 },
	dashboard: { flags: ['--json'], positional: 0 },
	released: { flags: ['--json', '--dry-run'], positional: 1 },
	'release-plan': { flags: ['--json'], positional: 1 },
	markers: { flags: ['--json', '--exclude'], positional: 0 },
	sessions: { flags: ['--json'], positional: 1 },
};

/** Whether every word is a known flag, a flag's value, or one of the positional words. */
function knownArgs(command: string | undefined, args: readonly string[]) {
	const shape = command ? SHAPES[command] : undefined;
	if (!shape) return false;
	let positional = 0;
	for (const [i, arg] of args.entries()) {
		const name = arg.startsWith('--exclude=') ? '--exclude' : arg;
		if (name.startsWith('-')) {
			if (!shape.flags.includes(name)) return false;
		} else if (['--duplicate-of', '--exclude'].includes(args[i - 1] ?? '')) {
		} else if (++positional > shape.positional) return false;
	}
	return true;
}

export async function main(
	ctx: CliContext,
	argv: readonly string[],
): Promise<ExitCode> {
	const [command, ...args] = argv;
	if (!knownArgs(command, args)) {
		ctx.err(USAGE);
		return EXIT.usage;
	}
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
			return depsCommand(
				ctx,
				positional[0],
				has('--file'),
				has('--public-app'),
			);
		case 'refresh':
			return refreshCommand(ctx);
		case 'ready':
			return readyCommand(ctx, has('--json'));
		case 'dashboard':
			return dashboardCommand(ctx, has('--json'));
		case 'release-plan':
			return releasedCommand(
				ctx,
				positional[0],
				has('--json'),
				true,
				'release-plan',
			);
		case 'released':
			return releasedCommand(
				ctx,
				positional[0],
				has('--json'),
				has('--dry-run'),
			);
		case 'markers': {
			const excludes = optionValues(args, '--exclude');
			if (!excludes) break;
			return markersCommand(ctx, has('--json'), excludes);
		}
		case 'sessions':
			return sessionsCommand(ctx, positional[0], has('--json'));
	}
	ctx.err(USAGE);
	return EXIT.usage;
}
