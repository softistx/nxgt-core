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
	console.error(
		`\nmigrate: unknown command "${command ?? ''}"\n` +
			`  valid commands: ${VALID_COMMANDS.join(', ')}\n` +
			`  run with --help to see usage\n`,
	);
	process.exit(1);
}

if (command === 'create' && !targetName) {
	console.error(
		'\nmigrate: --name is required for the "create" command\n' +
			'  example: bun cli.ts create --name my-migration\n',
	);
	process.exit(1);
}

if (!mongoUri && command !== 'create') {
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
		await mongoose.disconnect();
	}
}

main().catch((err) => {
	console.error('\nmigrate: fatal error\n', err);
	process.exit(1);
});
