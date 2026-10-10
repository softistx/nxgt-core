#!/usr/bin/env bun
/**
 * Stop: when the branch or the working tree changed the public surface of a
 * published package (a `package.json` not `"private": true`) without its
 * README or a docs/ page, block the end of the turn once per package with
 * what is missing. The repositories checked are the one holding the cwd and
 * the ones holding the files this session edited — a worktree edited by
 * absolute path while the cwd stays the main checkout included. Silent
 * otherwise: outside a git repository, with no published package touched,
 * while a documentation-auditor run is pending, for a package already
 * reported in this session, and on the stop the hook itself caused.
 */

import { readFileSync } from 'node:fs';
import { findGaps, type Gap, gapKey, newlyGapped } from '../lib/gaps';
import { runHook } from '../lib/hook';
import { buildReason } from '../lib/reason';
import {
	changedFiles,
	createLookup,
	mergeBase,
	repositoriesToCheck,
} from '../lib/repo';
import { record, reported, stateDir } from '../lib/state';
import { readTranscript, type TranscriptFacts } from '../lib/transcript';

const NONE: TranscriptFacts = { auditorPending: false, editedPaths: [] };

function facts(path: unknown): TranscriptFacts {
	if (typeof path !== 'string' || !path) return NONE;
	try {
		return readTranscript(readFileSync(path, 'utf8'));
	} catch {
		return NONE;
	}
}

function gapsIn(root: string): Gap[] {
	const base = mergeBase(root);
	return findGaps(
		changedFiles(root, base),
		createLookup(root, base ?? 'HEAD'),
	).map((gap) => ({ ...gap, root }));
}

await runHook((input) => {
	if (input.stop_hook_active === true) return undefined;
	const session = input.session_id;
	if (typeof session !== 'string' || !session) return undefined;
	const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();

	const transcript = facts(input.transcript_path);
	const roots = repositoriesToCheck(cwd, transcript.editedPaths);
	if (roots.length === 0) return undefined;
	const gaps = roots.flatMap(gapsIn);
	if (gaps.length === 0) return undefined;
	if (transcript.auditorPending) return undefined;

	const dir = stateDir(process.env);
	const fresh = newlyGapped(gaps, reported(dir, session));
	if (fresh.length === 0) return undefined;
	record(dir, session, fresh.map(gapKey));
	return { decision: 'block', reason: buildReason(fresh) };
});
