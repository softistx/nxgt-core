#!/usr/bin/env bun
/**
 * The crew CLI, behind the `/crew` skill and the session-coordinator agent.
 *
 *   crew.ts list [--json]                   live sessions, this one first
 *   crew.ts announce [--kind K] <text…>     K: working (default), plan, release, decision, note
 *   crew.ts announce --kind plan --entry <roadmap entry> [--scope <repo or package>]
 *                    [--needs <pkg@version>[,…]] <text…>
 *   crew.ts announce --kind plan --entry <roadmap entry> [--scope …] --drop [text…]
 *                                           withdraw this session's plan for that entry
 *   crew.ts align [--json]                  roadmaps and plans of every live session: duplicates, dependencies
 *   crew.ts claim <path> [note…]            mark a folder as this session's
 *   crew.ts unclaim <path>
 *   crew.ts yield [path]                    release this session's hold on its edited files (all, or under path)
 *   crew.ts whoami
 *
 * `--session <id>` names this session; without it the id comes from
 * `$NXGT_CREW_SESSION_ID`, which the SessionStart hook exports. The CLI writes
 * only this session's own record.
 */

import { resolve } from 'node:path';
import { align } from './lib/alignment';
import { renderAlignment } from './lib/alignment-text';
import { announce } from './lib/announcements';
import { listing } from './lib/brief';
import { worktreesOf } from './lib/conflicts';
import { claim, unclaim, yieldEdits } from './lib/holds';
import { livePeers } from './lib/liveness';
import { plansOf } from './lib/plans';
import {
	type AnnouncementKind,
	heartbeat,
	register,
	type SessionRecord,
} from './lib/record';
import { readRoadmaps } from './lib/roadmaps';
import { readSettings } from './lib/settings';
import { crewHome, readAll, readOne, write, writeMerged } from './lib/store';
import { probePid } from './lib/system';

const KINDS: readonly AnnouncementKind[] = [
	'working',
	'plan',
	'release',
	'decision',
	'note',
];

function fail(message: string): never {
	process.stderr.write(`crew: ${message}\n`);
	process.exit(1);
}

const argv = process.argv.slice(2);
const take = (flag: string): string | undefined => {
	const i = argv.indexOf(flag);
	if (i === -1) return undefined;
	const value = argv[i + 1];
	if (value === undefined || value.startsWith('--')) {
		fail(`${flag} needs a value`);
	}
	argv.splice(i, 2);
	return value;
};
const json = argv.includes('--json');
if (json) argv.splice(argv.indexOf('--json'), 1);
const sessionId =
	take('--session') || process.env.NXGT_CREW_SESSION_ID || undefined;
const kindArg = take('--kind');
const entryArg = take('--entry');
const scopeArg = take('--scope');
const needsArg = take('--needs');
const drop = argv.includes('--drop');
if (drop) argv.splice(argv.indexOf('--drop'), 1);
const [verb, ...rest] = argv;

const home = crewHome(process.env);
const settings = readSettings(process.env);
const now = new Date();

function own(): SessionRecord {
	if (!sessionId) {
		fail(
			'no session id: pass --session <id>, or run inside a session where the nxgt-crew SessionStart hook exported NXGT_CREW_SESSION_ID.',
		);
	}
	const found = readOne(home, sessionId);
	return heartbeat(
		found ?? register(undefined, { sessionId, cwd: process.cwd() }, now),
		now,
	);
}

switch (verb) {
	case undefined:
	case 'list': {
		const records = readAll(home);
		const self = sessionId
			? records.find((r) => r.sessionId === sessionId)
			: undefined;
		const peers = livePeers(records, sessionId ?? '', now, settings, probePid);
		if (json) {
			process.stdout.write(
				`${JSON.stringify({ self: self ?? null, peers: peers.map((p) => ({ liveness: p.liveness, ...p.record })) }, null, 2)}\n`,
			);
		} else {
			process.stdout.write(`${listing(self, peers, now, settings)}\n`);
		}
		break;
	}
	case 'announce': {
		const kind = (kindArg ?? 'working') as AnnouncementKind;
		if (!KINDS.includes(kind))
			fail(`--kind must be one of ${KINDS.join(', ')}`);
		const entry = entryArg?.trim();
		if (entryArg !== undefined && !entry) fail('--entry cannot be empty');
		if (kind === 'plan' && !entry) {
			fail('a plan needs --entry "<roadmap entry title>"');
		}
		if (drop && kind !== 'plan')
			fail('--drop withdraws a plan: use --kind plan');
		const text =
			rest.join(' ').trim() ||
			(entry ? `${drop ? 'dropped' : 'planning'} ${entry}` : '');
		if (!text) fail('announce needs a text');
		const needs = needsArg
			?.split(',')
			.map((n) => n.trim())
			.filter(Boolean);
		writeMerged(
			home,
			announce(own(), text, kind, now, {
				...(entry ? { entry } : {}),
				...(scopeArg?.trim() ? { scope: scopeArg.trim() } : {}),
				...(needs?.length && !drop ? { needs } : {}),
				...(drop ? { dropped: true } : {}),
			}),
		);
		process.stdout.write(
			`announced (${drop ? 'plan withdrawn' : kind}): ${text}\n`,
		);
		break;
	}
	case 'claim': {
		const [path, ...note] = rest;
		if (!path) fail('claim needs a path');
		const abs = resolve(path);
		writeMerged(home, claim(own(), abs, note.join(' ') || undefined, now));
		process.stdout.write(`claimed ${abs}\n`);
		break;
	}
	case 'unclaim': {
		const [path] = rest;
		if (!path) fail('unclaim needs a path');
		write(home, unclaim(own(), resolve(path)));
		process.stdout.write(`released ${resolve(path)}\n`);
		break;
	}
	case 'align': {
		const records = readAll(home);
		const self = sessionId
			? records.find((r) => r.sessionId === sessionId)
			: undefined;
		const peers = livePeers(records, sessionId ?? '', now, settings, probePid);
		const sessions = [...(self ? [self] : []), ...peers.map((p) => p.record)];
		const views = sessions.map((record) => ({
			record,
			roadmaps: [...worktreesOf(record, now, settings)].flatMap((wt) =>
				// The record's remote belongs to its own worktree only.
				readRoadmaps(wt, wt === record.worktree ? record.remote : undefined),
			),
		}));
		const result = align(views);
		if (json) {
			process.stdout.write(
				`${JSON.stringify(
					{
						sessions: views.map((v) => ({
							sessionId: v.record.sessionId,
							title: v.record.title,
							worktree: v.record.worktree,
							branch: v.record.branch,
							plans: plansOf(v.record),
							roadmaps: v.roadmaps,
						})),
						...result,
					},
					null,
					2,
				)}\n`,
			);
		} else {
			process.stdout.write(
				`${renderAlignment(result, views, sessionId ?? '')}\n`,
			);
		}
		break;
	}
	case 'yield': {
		const [path] = rest;
		const under = path === undefined ? undefined : resolve(path);
		write(home, yieldEdits(own(), under));
		process.stdout.write(
			`released the hold on ${under ?? 'every file this session edited'}\n`,
		);
		break;
	}
	case 'whoami':
		process.stdout.write(`${sessionId ?? 'unknown'}\n`);
		break;
	default:
		fail(
			`unknown command "${verb}" (list, announce, align, claim, unclaim, yield, whoami)`,
		);
}
