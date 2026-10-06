#!/usr/bin/env bun
/**
 * Type-checks `@nxgt/shared-mongo` with `--skipLibCheck false`, and fails only
 * on what is shared-mongo's own.
 *
 * Every other check here runs with `skipLibCheck: true`, which also skips the
 * hand-written `src/types/*.d.ts` that augment mongoose's `Model` — so a
 * TS2428 or TS2717 there (what #198 fixed) is invisible to the green bar.
 * Dependencies' own errors (`@types/nodemailer` raises a TS2430) are noise
 * and are dropped.
 *
 * A diagnostic counts when its file is under `packages/shared-mongo/`, or when
 * it is a TS2428/TS2717 naming a declaration shared-mongo augments. TS2428 is
 * reported on both declarations, so the half in mongoose's own
 * `types/models.d.ts` is matched by the second rule; the half in shared-mongo
 * is always there as well, which makes the first rule enough on its own.
 *
 * Needs the build to have run first, like `typecheck`.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PACKAGE = 'packages/shared-mongo';
const TYPES = join(ROOT, PACKAGE, 'src/types');

/** A diagnostic's first line: `file(line,col): error TSxxxx: message`. */
const DIAGNOSTIC = /^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/;
const DECLARATION_CODES = new Set(['TS2428', 'TS2717']);

export interface Diagnostic {
	readonly file: string;
	readonly code: string;
	readonly line: string;
}

export function parse(output: string): Diagnostic[] {
	const found: Diagnostic[] = [];
	for (const line of output.split('\n')) {
		const m = DIAGNOSTIC.exec(line);
		if (m?.[1] && m[2]) found.push({ file: m[1], code: m[2], line });
	}
	return found;
}

/** The interfaces and classes the `.d.ts` sources declare or augment. */
export function declaredNames(source: string): string[] {
	return [...source.matchAll(/\b(?:interface|class)\s+(\w+)/g)].flatMap((m) =>
		m[1] ? [m[1]] : [],
	);
}

export function ours(
	diagnostics: readonly Diagnostic[],
	names: ReadonlySet<string>,
): Diagnostic[] {
	return diagnostics.filter(
		(d) =>
			d.file.startsWith(`${PACKAGE}/`) ||
			(DECLARATION_CODES.has(d.code) &&
				[...names].some((n) => d.line.includes(`'${n}'`))),
	);
}

async function main(): Promise<boolean> {
	const names = new Set<string>();
	for (const f of await readdir(TYPES)) {
		if (f.endsWith('.d.ts')) {
			for (const n of declaredNames(await Bun.file(join(TYPES, f)).text())) {
				names.add(n);
			}
		}
	}
	const proc = Bun.spawn(
		[
			'bunx',
			'tsc',
			'--noEmit',
			'--pretty',
			'false',
			'--skipLibCheck',
			'false',
			'-p',
			`${PACKAGE}/tsconfig.json`,
		],
		{ cwd: ROOT, stdout: 'pipe', stderr: 'inherit' },
	);
	const output = await new Response(proc.stdout).text();
	const exit = await proc.exited;
	const all = parse(output);
	// tsc failing without one diagnostic is a broken run, never a pass.
	if (exit !== 0 && all.length === 0) {
		console.error(output);
		return false;
	}
	const mine = ours(all, names);
	for (const d of mine) console.error(d.line);
	console.log(
		`shared-mongo declarations: ${mine.length} error(s) of ${all.length} ` +
			'with skipLibCheck false (third-party ones ignored)',
	);
	return mine.length === 0;
}

if (import.meta.main && !(await main())) process.exit(1);
