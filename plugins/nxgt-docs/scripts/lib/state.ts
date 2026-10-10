/**
 * The packages already reported in a session, so each is reported once:
 * one small JSON file per session under the system temporary folder
 * (`NXGT_DOCS_STATE_DIR` overrides it, for the specs).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEEP = 200;

export function stateDir(env: Record<string, string | undefined>): string {
	return env['NXGT_DOCS_STATE_DIR'] || join(tmpdir(), 'nxgt-docs');
}

function stateFile(dir: string, session: string): string {
	return join(dir, `${session.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

/** The package keys reported so far; an unreadable file reads as none. */
export function reported(dir: string, session: string): string[] {
	try {
		const value: unknown = JSON.parse(
			readFileSync(stateFile(dir, session), 'utf8'),
		);
		const list = (value as { reported?: unknown })?.reported;
		return Array.isArray(list)
			? list.filter((s): s is string => typeof s === 'string')
			: [];
	} catch {
		return [];
	}
}

/** Records package keys as reported, keeping the latest few. */
export function record(
	dir: string,
	session: string,
	keys: readonly string[],
): void {
	const list = [
		...reported(dir, session).filter((k) => !keys.includes(k)),
		...keys,
	];
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		stateFile(dir, session),
		JSON.stringify({ reported: list.slice(-KEEP) }),
	);
}
