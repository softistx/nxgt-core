#!/usr/bin/env bun
/**
 * `nxgt-env` — write a `.env` from its template, generating what only this
 * deployment defines and refusing to invent what something else issues.
 *
 * Three commands, and the one that is not obvious is `check`: it is the CI
 * shape, and it is why the other two can stay silent about values.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { checkEnv, parseTemplate, parseValues, renderEnv } from './index';

const HELP = `nxgt-env — a .env is generated, not copied

Usage
  nxgt-env init   [--template <file>] [--out <file>] [--force] [--dry-run] [--show] [--strict]
  nxgt-env check  [--template <file>] [--out <file>]
  nxgt-env rotate <VAR>... [--template <file>] [--out <file>] [--show]

Options
  --template <file>  default: .env.example, then .env.template
  --out <file>       default: .env
  --force            overwrite values that are already set (init only)
  --dry-run          print what would change, write nothing
  --show             print generated values (they are hidden by default)
  --strict           exit 1 when a value still has to be pasted by a human

How a value is decided, in order
  1. an "# @env ..." annotation on a comment line above the key:
       # @env secret length=64        generate 64 url-safe characters
       # @env password length=24 charset=alnum
       # @env hex length=32 | base64 | uuid
       # @env manual <why>            never generated
       # @env copy                    take the template's value verbatim
  2. the name: *_SECRET, *_PASSWORD, *_PASS, *_PASSPHRASE, *_SALT,
     *_ENCRYPTION_KEY and *_SIGNING_KEY are generated.
  3. the name, narrower and first: *_TOKEN, *_API_KEY, *_ACCESS_KEY,
     *_CLIENT_ID, *_CLIENT_SECRET, *_PRIVATE_KEY, *_CERT, *_DSN and
     *_LICENSE_KEY are manual — something else issues them, and a generated
     one authenticates against nothing.
  4. otherwise the template's value is copied, and a placeholder
     (empty, CHANGE_ME, <like-this>, TODO, xxx) is left empty.

An existing .env is never overwritten: its values are kept, new keys are
appended in the template's own order, and the file is written 0600.`;

function arg(name: string, fallback?: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? fallback : process.argv[index + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function resolveTemplate(): string {
	const explicit = arg('template');
	if (explicit) {
		if (!existsSync(explicit)) fail(`no such template: ${explicit}`);
		return explicit;
	}
	for (const candidate of ['.env.example', '.env.template']) {
		if (existsSync(candidate)) return candidate;
	}
	return fail('no .env.example or .env.template here — pass --template');
}

function fail(message: string): never {
	console.error(`nxgt-env: ${message}`);
	process.exit(1);
}

const command = process.argv[2];
if (
	!command ||
	command === '--help' ||
	command === '-h' ||
	command === 'help'
) {
	console.log(HELP);
	process.exit(0);
}

const templatePath = resolveTemplate();
const outPath = arg('out', '.env') as string;
const templateText = readFileSync(templatePath, 'utf8');

if (command === 'check') {
	if (!existsSync(outPath))
		fail(`${outPath} does not exist — run \`nxgt-env init\``);
	const result = checkEnv(templateText, readFileSync(outPath, 'utf8'));
	const say = (label: string, keys: string[]) =>
		keys.length && console.log(`${label}: ${keys.join(', ')}`);
	say('missing', result.missing);
	say('empty', result.empty);
	say('waiting to be pasted', result.pending);
	say('not in the template', result.extra);
	if (result.ok && !result.extra.length && !result.pending.length) {
		console.log(`${outPath} matches ${templatePath}`);
	}
	process.exit(result.ok ? 0 : 1);
}

if (command === 'init' || command === 'rotate') {
	const template = parseTemplate(templateText);
	const existing = existsSync(outPath)
		? parseValues(readFileSync(outPath, 'utf8'))
		: new Map<string, string>();

	let rotate: string[] = [];
	if (command === 'rotate') {
		rotate = process.argv
			.slice(3)
			.filter((value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value));
		if (!rotate.length) fail('name at least one variable to rotate');
		const known = new Set(template.entries.map((entry) => entry.key));
		const unknown = rotate.filter((key) => !known.has(key));
		if (unknown.length) fail(`not in ${templatePath}: ${unknown.join(', ')}`);
		const manual = template.entries.filter(
			(entry) => rotate.includes(entry.key) && entry.source.kind !== 'generate',
		);
		if (manual.length) {
			fail(
				`these are not generated here, so rotating them is done where they are issued: ${manual
					.map((entry) => entry.key)
					.join(', ')}`,
			);
		}
	}

	const result = renderEnv(template, {
		existing,
		rotate:
			command === 'rotate' ? rotate : flag('force') ? [...existing.keys()] : [],
	});

	if (flag('dry-run')) {
		console.log(`would write ${outPath}`);
	} else {
		writeFileSync(outPath, result.text);
		chmodSync(outPath, 0o600);
		console.log(`wrote ${outPath} (0600)`);
	}

	if (result.generated.length) {
		console.log(`generated: ${result.generated.join(', ')}`);
		if (flag('show')) {
			const values = parseValues(result.text);
			for (const key of result.generated)
				console.log(`  ${key}=${values.get(key)}`);
		}
	}
	if (result.kept.length)
		console.log(`kept: ${result.kept.length} existing value(s)`);
	if (result.pending.length) {
		console.log(`\nto be pasted by a human — nothing here can invent them:`);
		for (const key of result.pending) {
			const entry = template.entries.find((candidate) => candidate.key === key);
			const why =
				entry?.source.kind === 'manual'
					? entry.source.reason
					: 'no value in the template';
			console.log(`  ${key} — ${why}`);
		}
		if (flag('strict')) process.exit(1);
	}
	process.exit(0);
}

fail(`unknown command: ${command}\n\n${HELP}`);
