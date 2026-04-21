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
 *
 * Options:
 *   --dir   <path>   Directory containing migration files (default: ./migrations)
 *   --name  <name>   Target a specific migration by name (for up/down)
 *   --uri   <uri>    MongoDB connection URI (overrides MONGODB_URI env var)
 *
 * Examples:
 *   bun src/migrations/cli.ts up --dir ./migrations
 *   bun src/migrations/cli.ts up --dir ./migrations --name 20260421120000-add-user-indexes
 *   bun src/migrations/cli.ts down --dir ./migrations
 *   bun src/migrations/cli.ts down --dir ./migrations --name 20260421120000-add-user-indexes
 *   bun src/migrations/cli.ts list --dir ./migrations
 */

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { MigrationRunner } from './migration.runner';
import type { MigrationListEntry } from './migration.types';

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
	args: Bun.argv,
	allowPositionals: true,
	options: {
		dir: { type: 'string', short: 'd', default: './migrations' },
		name: { type: 'string', short: 'n' },
		uri: { type: 'string', short: 'u' },
	},
});

const command = positionals[2];
const migrationsDir = resolve(values.dir);
const targetName = values.name;
const mongoUri = values.uri ?? Bun.env.MONGODB_URI;

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_COMMANDS = ['up', 'down', 'list'] as const;
type Command = (typeof VALID_COMMANDS)[number];

function isValidCommand(cmd: string | undefined): cmd is Command {
	return VALID_COMMANDS.includes(cmd as Command);
}

if (!isValidCommand(command)) {
	console.error(
		`\nmigrate: unknown command "${command ?? ''}"\n` +
			`  valid commands: ${VALID_COMMANDS.join(', ')}\n` +
			`  run with --help to see usage\n`,
	);
	process.exit(1);
}

if (!mongoUri) {
	console.error(
		'\nmigrate: MONGODB_URI is required\n' +
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
		console.log('\nmigrate: no migration files found\n');
		return;
	}

	const col = (s: string, w: number) => s.padEnd(w);

	const nameWidth = Math.max(...entries.map((e) => e.name.length));

	console.log('');
	console.log(
		`  ${col('status ', 9)}  ${col('batch', 7)}  ${col('name', nameWidth)}  executed-at`,
	);
	console.log(
		`  ${'─'.repeat(9)}  ${'─'.repeat(7)}  ${'─'.repeat(nameWidth)}  ${'─'.repeat(24)}`,
	);

	for (const entry of entries) {
		const status = STATUS_LABEL[entry.status];
		const batch =
			entry.batch != null ? String(entry.batch).padEnd(7) : '─'.padEnd(7);
		const executedAt = entry.executedAt ? entry.executedAt.toISOString() : '─';

		console.log(
			`  ${status}  ${batch}  ${col(entry.name, nameWidth)}  ${executedAt}`,
		);
	}

	console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	await mongoose.connect(mongoUri ?? '');

	const runner = new MigrationRunner({
		migrationsDir,
		connection: mongoose.connection,
	});

	try {
		switch (command) {
			case 'up':
				await runner.up(targetName ? { name: targetName } : undefined);
				break;

			case 'down':
				await runner.down(targetName ? { name: targetName } : undefined);
				break;

			case 'list': {
				const entries = await runner.list();
				printList(entries);
				break;
			}
		}
	} finally {
		await mongoose.disconnect();
	}
}

main().catch((err) => {
	console.error('\nmigrate: fatal error\n', err);
	process.exit(1);
});
