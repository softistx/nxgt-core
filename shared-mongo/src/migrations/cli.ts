#!/usr/bin/env bun

/**
 * Migration CLI
 *
 * Usage:
 *   bun src/migrations/cli.ts <command> [options]
 *
 * Commands:
 *   up      Run all pending migrations (or a specific one with --name)
 *   down    Rollback the last batch (or a specific one with --name)
 *   list    Print all migrations with their current status
 *   create  Generate a new migration file with boilerplate
 *
 * Options:
 *   --dir      <path>   Directory containing migration files (default: ./migrations)
 *   --name     <name>   Name for new migration (create) or target specific (up/down)
 *   --uri      <uri>    MongoDB connection URI (overrides MONGODB_URI env var)
 *   --dry-run           Show what would happen without executing (up/down)
 *
 * Examples:
 *   bun src/migrations/cli.ts create --name add-user-indexes
 *   bun src/migrations/cli.ts up --dir ./migrations
 *   bun src/migrations/cli.ts up --name 20260421120000-add-user-indexes --dry-run
 *   bun src/migrations/cli.ts down --dir ./migrations
 *   bun src/migrations/cli.ts list --dir ./migrations
 */

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { MigrationRunner } from './migration.runner';
import type { MigrationListEntry } from './migration.types';
import { logger } from './migration.utils';

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
	args: Bun.argv,
	allowPositionals: true,
	options: {
		dir: { type: 'string', short: 'd', default: './migrations' },
		name: { type: 'string', short: 'n' },
		uri: { type: 'string', short: 'u' },
		'dry-run': { type: 'boolean' },
	},
});

const command = positionals[2];
const migrationsDir = resolve(values.dir);
const targetName = values.name;
const mongoUri = values.uri ?? Bun.env.MONGODB_URI;
const dryRun = values['dry-run'];

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_COMMANDS = ['up', 'down', 'list', 'create'] as const;
type Command = (typeof VALID_COMMANDS)[number];

function isValidCommand(cmd: string | undefined): cmd is Command {
	return VALID_COMMANDS.includes(cmd as Command);
}

if (!isValidCommand(command)) {
	logger.error(
		`\nunknown command "${command ?? ''}"\n` +
			`  valid commands: ${VALID_COMMANDS.join(', ')}\n` +
			`  run with --help to see usage\n`,
	);
	process.exit(1);
}

if (command === 'create' && !targetName) {
	logger.error(
		'\n--name is required for the "create" command\n' +
			'  example: bun cli.ts create --name my-migration\n',
	);
	process.exit(1);
}

if (!mongoUri && command !== 'create') {
	logger.error(
		'\nMONGODB_URI is required\n' +
			'  set the MONGODB_URI environment variable or pass --uri <uri>\n',
	);
	process.exit(1);
}

// ─── List formatting ──────────────────────────────────────────────────────────

const STATUS_LABEL: Record<MigrationListEntry['status'], string> = {
	pending: 'pending',
	up: 'up     ',
	failed: 'FAILED ',
};

function printList(entries: MigrationListEntry[]): void {
	if (entries.length === 0) {
		logger.info('\nno migration files found\n');
		return;
	}

	const col = (s: string, w: number) => s.padEnd(w);

	const nameWidth = Math.max(...entries.map((e) => e.name.length));

	logger.info('');
	logger.info(
		`  ${col('status ', 9)}  ${col('batch', 7)}  ${col('name', nameWidth)}  executed-at`,
	);
	logger.info(
		`  ${'─'.repeat(9)}  ${'─'.repeat(7)}  ${'─'.repeat(nameWidth)}  ${'─'.repeat(24)}`,
	);

	for (const entry of entries) {
		const status = STATUS_LABEL[entry.status];
		const batch =
			entry.batch != null ? String(entry.batch).padEnd(7) : '─'.padEnd(7);
		const executedAt = entry.executedAt ? entry.executedAt.toISOString() : '─';

		logger.info(
			`  ${status}  ${batch}  ${col(entry.name, nameWidth)}  ${executedAt}`,
		);
	}

	logger.info('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	if (command === 'create') {
		const runner = new MigrationRunner({
			migrationsDir,
			connection: null as any,
		});
		await runner.create({ name: targetName || 'unnamed-migration' });
		return;
	}

	await mongoose.connect(mongoUri ?? '');

	const runner = new MigrationRunner({
		migrationsDir,
		connection: mongoose.connection,
	});

	try {
		switch (command) {
			case 'up':
				await runner.up({ name: targetName, dryRun });
				break;

			case 'down':
				await runner.down({ name: targetName, dryRun });
				break;

			case 'list': {
				const entries = await runner.list();
				printList(entries);
				break;
			}
		}
	} finally {
		// Tearing down the pool makes mongodb 7 reject every still-checked-out
		// connection with `MongoClientClosedError`, and mongoose 9 lets that
		// escape *outside* the promise `disconnect()` returns — so a plain
		// `.catch()` does not see it and it lands as an unhandled rejection,
		// which Bun treats as fatal. That happens after the command has already
		// done its work, so it would turn a successful `up` into a non-zero exit
		// and fail any CI step or `docker compose run` wrapping this CLI.
		//
		// The guard is installed only for teardown and removed straight after,
		// so a genuine unhandled rejection during the migrations themselves is
		// still fatal. Both the escaping rejection and the returned one are
		// routed to the same warning.
		const ignoreTeardownRejection = (err: unknown) => {
			logger.warn('mongo disconnect reported an error during shutdown', err);
		};

		process.on('unhandledRejection', ignoreTeardownRejection);
		try {
			await mongoose.disconnect().catch(ignoreTeardownRejection);
		} finally {
			process.off('unhandledRejection', ignoreTeardownRejection);
		}
	}
}

// The exit code is settled here rather than left to a natural exit. Tearing the
// mongo pool down rejects every still-checked-out connection with
// `MongoClientClosedError`, and mongoose 9 lets that escape its own
// `disconnect()` promise — so it lands as an unhandled rejection *after* the
// command has already succeeded, and a natural exit would report 1 for a run
// that did all its work. Anything the commands themselves throw still reaches
// the catch below and still exits 1.
main()
	.then(() => process.exit(0))
	.catch((err) => {
		logger.error('\nfatal error\n', err);
		process.exit(1);
	});
