#!/usr/bin/env bun
/**
 * The crew CLI, behind the `/crew` skill and the session-coordinator agent.
 *
 *   crew.ts list [--json]                   live sessions, this one first
 *   crew.ts announce [--kind K] <text…>     K: working (default), release, decision, note
 *   crew.ts claim <path> [note…]            mark a folder as this session's
 *   crew.ts unclaim <path>
 *   crew.ts whoami
 *
 * `--session <id>` names this session; without it the id comes from
 * `$NXGT_CREW_SESSION_ID`, which the SessionStart hook exports. The CLI writes
 * only this session's own record.
 */

import { resolve } from 'node:path';
import { listing } from './lib/brief';
import {
	type AnnouncementKind,
	announce,
	claim,
	heartbeat,
	livePeers,
	readSettings,
	register,
	type SessionRecord,
	unclaim,
} from './lib/registry';
import { crewHome, readAll, readOne, write } from './lib/store';
import { probePid } from './lib/system';

const KINDS: readonly AnnouncementKind[] = [
	'working',
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
	argv.splice(i, 2);
	return value;
};
const json = argv.includes('--json');
if (json) argv.splice(argv.indexOf('--json'), 1);
const sessionId =
	take('--session') || process.env.NXGT_CREW_SESSION_ID || undefined;
const kindArg = take('--kind');
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
		const text = rest.join(' ').trim();
		if (!text) fail('announce needs a text');
		write(home, announce(own(), text, kind, now));
		process.stdout.write(`announced (${kind}): ${text}\n`);
		break;
	}
	case 'claim': {
		const [path, ...note] = rest;
		if (!path) fail('claim needs a path');
		const abs = resolve(path);
		write(home, claim(own(), abs, note.join(' ') || undefined, now));
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
	case 'whoami':
		process.stdout.write(`${sessionId ?? 'unknown'}\n`);
		break;
	default:
		fail(`unknown command "${verb}" (list, announce, claim, unclaim, whoami)`);
}
