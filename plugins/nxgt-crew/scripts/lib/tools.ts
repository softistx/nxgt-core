/**
 * Reading the tool inputs and results the hooks care about. Pure.
 */

import { isAbsolute } from 'node:path';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** The absolute path a file-writing tool targets, if any. */
export function editedPath(
	tool: string | undefined,
	input: Record<string, unknown> | undefined,
): string | undefined {
	if (!tool || !EDIT_TOOLS.has(tool) || !input) return undefined;
	const path = input.file_path ?? input.notebook_path;
	return typeof path === 'string' && isAbsolute(path) ? path : undefined;
}

/**
 * The folders a Bash command created with `mktemp -d` and printed: absolute
 * lines of its stdout under a temporary directory. Only a command that runs
 * `mktemp` is read, so an `ls /tmp` never claims anything.
 */
export function claimsFromMktemp(
	input: Record<string, unknown> | undefined,
	response: unknown,
	tmpRoots: readonly string[] = [
		'/tmp/',
		'/var/folders/',
		'/private/var/folders/',
	],
): string[] {
	const command = input?.command;
	if (typeof command !== 'string' || !/\bmktemp\b/.test(command)) return [];
	const stdout =
		typeof response === 'object' && response !== null
			? (response as Record<string, unknown>).stdout
			: undefined;
	if (typeof stdout !== 'string') return [];
	const roots = [...tmpRoots, process.env.TMPDIR]
		.filter((r): r is string => typeof r === 'string' && r.length > 1)
		.map((r) => (r.endsWith('/') ? r : `${r}/`));
	return stdout
		.split('\n')
		.map((l) => l.trim())
		.filter(
			(l) =>
				isAbsolute(l) &&
				!/\s/.test(l) &&
				roots.some((r) => l.startsWith(r) && l.length > r.length),
		)
		.slice(0, 5);
}
