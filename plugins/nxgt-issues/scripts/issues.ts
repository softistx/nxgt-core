#!/usr/bin/env bun
/**
 * The nxgt-issues CLI, behind the `report-to-upstream` skill. It is the only
 * file that builds the real runner (so the only one that spawns `gh` and
 * `git` or reaches the registry); everything else lives in `lib/` and takes
 * the runner as a parameter. It acts on the directory it is run from (the
 * application), or on `--cwd <dir>`. See `lib/cli.ts` for the subcommands and
 * the README for the inputs, refusals and exit codes.
 */

import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import { issuesHome } from './lib/cache';
import { main } from './lib/cli';
import { disabled } from './lib/hook';
import { createRunner } from './lib/runner';

const argv = process.argv.slice(2);
const cwdIndex = argv.indexOf('--cwd');
const cwd =
	cwdIndex === -1 ? process.cwd() : resolve(argv[cwdIndex + 1] ?? '.');
if (cwdIndex !== -1) argv.splice(cwdIndex, 2);

if (disabled(process.env)) {
	process.stderr.write('nxgt-issues is disabled (NXGT_ISSUES_DISABLE).\n');
	process.exit(1);
}

const code = await main(
	{
		runner: createRunner(),
		env: process.env,
		cwd,
		home: issuesHome(process.env),
		now: Date.now,
		hostname: hostname(),
		homeDir: homedir(),
		stdin: () => Bun.stdin.text(),
		out: (line) => process.stdout.write(`${line}\n`),
		err: (line) => process.stderr.write(`${line}\n`),
	},
	argv,
);
process.exit(code);
