/**
 * The two facts the hooks read from the machine: where a directory sits in
 * git, and whether a process is still running. Everything that can fail here
 * returns "unknown" instead of throwing.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { $ } from 'bun';
import type { GitPlace, PidProbe } from './registry';

/**
 * The nearest existing directory at or above `path`: the folder of a file, or
 * an ancestor when a Write is about to create the folders.
 */
export function existingDir(path: string): string {
	let dir = resolve(path);
	while (!existsSync(dir) || !statSync(dir).isDirectory()) {
		const up = dirname(dir);
		if (up === dir) return dir;
		dir = up;
	}
	return dir;
}

export async function gitPlace(dir: string): Promise<GitPlace> {
	const at = existingDir(dir);
	const rev =
		await $`git -C ${at} rev-parse --path-format=absolute --show-toplevel --git-common-dir`
			.quiet()
			.nothrow();
	if (rev.exitCode !== 0) return {};
	const [worktree, repo] = rev.stdout.toString().trim().split('\n');
	// `symbolic-ref`, not `rev-parse --abbrev-ref HEAD`: it also names the
	// unborn branch of a repository with no commit, and fails on a detached HEAD.
	const [head, remote] = await Promise.all([
		$`git -C ${at} symbolic-ref --short -q HEAD`.quiet().nothrow(),
		$`git -C ${at} config --get remote.origin.url`.quiet().nothrow(),
	]);
	const branch = head.exitCode === 0 ? head.stdout.toString().trim() : '';
	const url = remote.exitCode === 0 ? remote.stdout.toString().trim() : '';
	return {
		worktree: worktree || undefined,
		repo: repo || undefined,
		branch: branch || undefined,
		remote: url || undefined,
	};
}

/** Resolves each directory once, then answers synchronously for the pure rules. */
export async function placeResolver(
	dirs: readonly string[],
): Promise<(dir: string) => GitPlace> {
	const cache = new Map<string, GitPlace>();
	await Promise.all(
		dirs.map(async (d) => {
			cache.set(d, await gitPlace(d));
		}),
	);
	return (dir) => cache.get(dir) ?? {};
}

/**
 * A process's start time, from `/proc/<pid>/stat` (field 22, in clock ticks
 * since boot). Only Linux has it; elsewhere it is unknown and not compared.
 */
export function processStart(pid: number): string | undefined {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
		// The command name, field 2, may hold spaces: count from its closing `)`.
		const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
		return fields[19];
	} catch {
		return undefined;
	}
}

/**
 * Whether a record's Claude Code process still runs. A pid recorded on
 * another host — or another PID namespace sharing `~/.claude` — is unknown,
 * never dead; a pid whose start time changed was reused, so the session is dead.
 */
export const probePid: PidProbe = (record) => {
	const pid = record.pid;
	if (pid === undefined || record.host !== hostname()) return undefined;
	try {
		process.kill(pid, 0);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return false;
		if (code !== 'EPERM') return undefined;
	}
	if (record.pidStart === undefined) return true;
	const start = processStart(pid);
	return start === undefined ? true : start === record.pidStart;
};

export interface ClaudeProcess {
	readonly pid: number;
	readonly pidStart?: string;
	readonly host: string;
}

/**
 * The Claude Code process that ran this hook, when it can be recognised.
 * A hook in exec form is spawned directly by Claude Code, so it is the parent;
 * the pid is kept only when that parent's command line names `claude`, so a
 * wrapper process that exits at once can never make a live session look gone.
 */
export async function claudeProcess(): Promise<ClaudeProcess | undefined> {
	const pid = process.ppid;
	if (!pid || pid <= 1) return undefined;
	const ps = await $`ps -o command= -p ${pid}`.quiet().nothrow();
	if (ps.exitCode !== 0 || !/claude/i.test(ps.stdout.toString())) {
		return undefined;
	}
	return { pid, pidStart: processStart(pid), host: hostname() };
}
