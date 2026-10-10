#!/usr/bin/env bun
/**
 * Stop: when the branch or the working tree changed the public surface of a
 * published package (a `package.json` not `"private": true`) without its
 * README, block the end of the turn once with what is missing. Silent
 * otherwise: outside a git repository, with no published package touched,
 * while a documentation-auditor run is pending, on a gap already reported in
 * this session, and on the stop the hook itself caused.
 */

import { readFileSync } from 'node:fs';
import { findGaps, signature } from '../lib/gaps';
import { runHook } from '../lib/hook';
import { buildReason } from '../lib/reason';
import {
	changedFiles,
	createLookup,
	mergeBase,
	repositoryRoot,
} from '../lib/repo';
import { record, reported, stateDir } from '../lib/state';
import { auditorPending } from '../lib/transcript';

function pending(path: unknown): boolean {
	if (typeof path !== 'string' || !path) return false;
	try {
		return auditorPending(readFileSync(path, 'utf8'));
	} catch {
		return false;
	}
}

await runHook((input) => {
	if (input.stop_hook_active === true) return undefined;
	const session = input.session_id;
	if (typeof session !== 'string' || !session) return undefined;
	const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();

	const root = repositoryRoot(cwd);
	if (!root) return undefined;
	const base = mergeBase(root);
	const gaps = findGaps(
		changedFiles(root, base),
		createLookup(root, base ?? 'HEAD'),
	);
	if (gaps.length === 0) return undefined;
	if (pending(input.transcript_path)) return undefined;

	const dir = stateDir(process.env);
	const sig = signature(gaps);
	if (reported(dir, session).includes(sig)) return undefined;
	record(dir, session, sig);
	return { decision: 'block', reason: buildReason(gaps) };
});
