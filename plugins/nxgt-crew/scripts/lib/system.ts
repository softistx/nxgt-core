/**
 * The two facts the hooks read from the machine: where a directory sits in
 * git, and whether a process is still running. Everything that can fail here
 * returns "unknown" instead of throwing.
 */

import { existsSync, statSync } from 'node:fs';
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

export const probePid: PidProbe = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return false;
		if (code === 'EPERM') return true;
		return undefined;
	}
};

/**
 * The Claude Code process that ran this hook, when it can be recognised.
 * A hook in exec form is spawned directly by Claude Code, so it is the parent;
 * the pid is kept only when that parent's command line names `claude`, so a
 * wrapper process that exits at once can never make a live session look gone.
 */
export async function claudePid(): Promise<number | undefined> {
	const pid = process.ppid;
	if (!pid || pid <= 1) return undefined;
	const ps = await $`ps -o command= -p ${pid}`.quiet().nothrow();
	if (ps.exitCode !== 0) return undefined;
	return /claude/i.test(ps.stdout.toString()) ? pid : undefined;
}
