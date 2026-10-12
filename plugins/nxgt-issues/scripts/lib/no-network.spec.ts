import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Only runner.ts may spawn a process, open a socket or reach the network. */
const FORBIDDEN: readonly [string, RegExp][] = [
	['Bun.spawn', /\bBun\.spawn(Sync)?\b/],
	['Bun.$', /\bBun\.\$/],
	['Bun[', /\bBun\s*\[/],
	[
		'Bun sockets',
		/\bBun\.(connect|listen|serve|udpSocket|s3|sql|SQL|redis|S3Client|RedisClient)\b/,
	],
	[
		'Bun clients',
		/\b(?:S3Client|RedisClient|SQL)\b|\b(?:sql|redis)\s*[`(.]|import\s*\{[^}]*\b(?:sql|redis)\b[^}]*\}/,
	],
	// Bun.Glob and Bun.YAML read the disk (workspaces.ts); they spawn nothing and open no socket.
	['any Bun', /\bBun\b(?!\.(?:stdin|Glob|YAML)\b)/],
	['createRequire', /\bcreateRequire\b|['"](?:node:)?module['"]/],
	['require(variable)', /\brequire\s*\(\s*(?!['"])/],
	['Worker', /\bWorker\b/],
	['process.binding', /\bprocess\s*\.\s*binding\b/],
	['browser network', /\b(?:XMLHttpRequest|EventSource|sendBeacon)\b/],
	['dynamic import', /\bimport\s*\(\s*(?!['"]\.{1,2}\/)/],
	['Bun Shell ($`)', /(?<=^|[\s(=,])\$`/m],
	[
		"import from 'bun'",
		/import\s*\{[^}]*(?:\bspawn(?:Sync)?\b|\$|\bconnect\b|\blisten\b|\bserve\b|\bfetch\b)[^}]*\}\s*from\s*['"]bun['"]|import\s+(?!type\b)(?:\*\s+as\s+)?\w+\s+from\s*['"]bun['"]|require\(\s*['"]bun['"]\s*\)/,
	],
	[
		'node:network',
		/(?:node:|from\s*['"]|require\(\s*['"]|import\(\s*['"])(?:child_process|http2?|https|net|tls|dgram|dns)(?:\/promises)?\b/,
	],
	['WebSocket', /\bWebSocket\b/],
	['globalThis', /\bglobalThis\s*(?:\.\s*(?:fetch|Bun|process)\b|\[)/],
	['fetch', /(?<![\w$])fetch\b(?!Json)/],
];

const stripComments = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const isSource = (name: string) =>
	/\.[cm]?[jt]sx?$/.test(name) && !/\.(spec|test)\.[cm]?[jt]sx?$/.test(name);

/** `lib/` (fixtures included), then the hook entries: each is `[path from lib/, label]`. */
const scanned = [
	...(readdirSync(import.meta.dir, { recursive: true }) as string[])
		.map((name) => name.replaceAll('\\', '/'))
		.filter((name) => isSource(name) && name !== 'runner.ts'),
	...readdirSync(join(import.meta.dir, '..', 'hooks'))
		.filter(isSource)
		.map((name) => `../hooks/${name}`),
];
const libraryFiles = scanned.filter((name) => !name.includes('.fixtures.'));
const fixtureFiles = scanned.filter((name) => name.includes('.fixtures.'));

describe('no process or network outside runner.ts', () => {
	test('the check sees the library', () => {
		// By base name: a file moved into a subfolder of lib/ is still seen.
		const sees = (files: string[], base: string) =>
			files.some((f) => f === base || f.endsWith(`/${base}`));
		expect(sees(libraryFiles, 'scrub.ts')).toBe(true);
		expect(sees(libraryFiles, 'fold.ts')).toBe(true);
		expect(libraryFiles).not.toContain('runner.ts');
	});

	test('the check sees the hook entries and the fixtures', () => {
		expect(libraryFiles).toContain('../hooks/session-start.ts');
		expect(fixtureFiles.some((f) => f.endsWith('runner.fixtures.ts'))).toBe(
			true,
		);
		expect(
			fixtureFiles.some((f) => f.endsWith('release-checkout.fixtures.ts')),
		).toBe(true);
	});

	// A fixture's fake has `fetch` rules and a `fetches` list: only a call counts there.
	const FIXTURE_FORBIDDEN: readonly [string, RegExp][] = [
		...FORBIDDEN.filter(([label]) => label !== 'fetch'),
		['fetch call', /(?<![\w$.])fetch\s*\(/],
	];

	test.each([...libraryFiles, ...fixtureFiles])('%s', (name) => {
		const source = stripComments(
			readFileSync(join(import.meta.dir, name), 'utf8'),
		);
		const patterns = name.includes('.fixtures.')
			? FIXTURE_FORBIDDEN
			: FORBIDDEN;
		for (const [label, pattern] of patterns) {
			expect({ file: name, label, found: pattern.test(source) }).toEqual({
				file: name,
				label,
				found: false,
			});
		}
	});

	test.each(fixtureFiles)(
		'%s imports nothing from runner.ts but its types',
		(name) => {
			const source = stripComments(
				readFileSync(join(import.meta.dir, name), 'utf8'),
			);
			const imports = [
				...source.matchAll(
					/import\s+(type\s+)?[^;]*?from\s*['"](?:\.\.?\/)+runner['"]/g,
				),
			];
			for (const found of imports) expect(found[1]).toBe('type ');
			expect(source).not.toMatch(/createRunner/);
		},
	);

	test('runner.ts is where they live', () => {
		const source = readFileSync(join(import.meta.dir, 'runner.ts'), 'utf8');
		expect(source).toMatch(/Bun\.spawn/);
		expect(source).toMatch(/fetch\(/);
	});
});

describe('the fixture patterns', () => {
	const call = /(?<![\w$.])fetch\s*\(/;
	test.each(['await fetch(url)', 'fetch (url)', 'x = fetch(u)'])(
		'catch %p',
		(code) => {
			expect(call.test(code)).toBe(true);
		},
	);
	test.each([
		'options.fetch ?? []',
		'fetch?: readonly Rule[]',
		'rules.fetch?.find(x)',
		'fetchJson(u)',
	])('leave %p', (code) => {
		expect(call.test(code)).toBe(false);
	});
});

describe('the patterns themselves', () => {
	const hit = (label: string, code: string) =>
		FORBIDDEN.find(([name]) => name === label)?.[1].test(code);

	test.each([
		['Bun.spawn', 'Bun.spawn(["x"])'],
		['Bun.spawn', 'Bun.spawnSync(["x"])'],
		['Bun.$', 'await Bun.$`ls`'],
		['Bun[', 'Bun["spawn"](["x"])'],
		['Bun[', 'Bun [ "spawn" ]'],
		['Bun sockets', 'await Bun.connect({})'],
		['Bun sockets', 'Bun.listen({})'],
		['Bun Shell ($`)', 'await $`ls`'],
		["import from 'bun'", "import { spawn } from 'bun'"],
		["import from 'bun'", 'import { $ } from "bun"'],
		["import from 'bun'", "import { file, spawnSync as s } from 'bun'"],
		["import from 'bun'", "import * as B from 'bun'"],
		["import from 'bun'", "import Bun from 'bun'"],
		["import from 'bun'", "const b = require('bun')"],
		['node:network', "import { x } from 'node:child_process'"],
		['node:network', "import { x } from 'node:http'"],
		['node:network', "import https from 'node:https'"],
		['node:network', "import net from 'net'"],
		['node:network', "import { x } from 'node:tls'"],
		['node:network', "import dgram from 'node:dgram'"],
		['node:network', "import { x } from 'node:dns/promises'"],
		['node:network', "const c = require('child_process')"],
		['node:network', "await import('child_process')"],
		['node:network', 'await import("node:http")'],
		['node:network', "import('dns/promises')"],
		['dynamic import', "await import('child_process')"],
		['dynamic import', 'await import(name)'],
		['dynamic import', 'import(`node:` + x)'],
		['any Bun', 'const { spawn } = Bun'],
		['any Bun', 'Bun?.spawn(["x"])'],
		['any Bun', 'const B = Bun'],
		['any Bun', "await Bun.write('s3://bucket/key', data)"],
		['any Bun', 'Bun.stdout.write(x)'],
		['any Bun', "Bun.file('s3://bucket/key')"],
		['any Bun', 'await Bun.file(path).text()'],
		['createRequire', "import { createRequire } from 'node:module'"],
		['createRequire', 'const r = createRequire(import.meta.url)'],
		['createRequire', "require('module')"],
		['require(variable)', 'require(variable)'],
		['require(variable)', 'require(`node:` + x)'],
		['Worker', 'new Worker(url)'],
		['process.binding', 'process.binding("tcp_wrap")'],
		['Bun sockets', 'const s = Bun.s3.file("x")'],
		['Bun sockets', 'Bun.sql`select 1`'],
		['Bun sockets', 'Bun.redis.get(k)'],
		['Bun clients', 'new S3Client({})'],
		['Bun clients', 'new RedisClient(url)'],
		['Bun clients', 'import { sql } from "bun"'],
		['Bun clients', 'new SQL(url)'],
		['browser network', 'new XMLHttpRequest()'],
		['browser network', 'new EventSource(url)'],
		['browser network', 'navigator.sendBeacon(u)'],
		['WebSocket', 'new WebSocket(url)'],
		['globalThis', 'await globalThis.fetch(url)'],
		['globalThis', "globalThis['fetch'](url)"],
		['fetch', 'await fetch(url)'],
		['fetch', 'const f = fetch'],
		['fetch', 'app.fetch(req)'],
	])('%s catches %p', (label, code) => {
		expect(hit(label, code)).toBe(true);
	});

	test.each([
		['Bun Shell ($`)', 'new RegExp(`^a/?$`)'],
		['fetch', 'fetchJson(url)'],
		['fetch', 'runner.fetchJson(url)'],
		['fetch', 'refetch(url)'],
		['Bun.spawn', 'const spawned = 1'],
		["import from 'bun'", "import { test } from 'bun:test'"],
		["import from 'bun'", "import type { Runner } from 'bun'"],
		['node:network', "import { join } from 'node:path'"],
		['node:network', "import { readFileSync } from 'node:fs'"],
		['node:network', "import { x } from './http-thing'"],
		['dynamic import', "await import('./local')"],
		['dynamic import', 'important(x)'],
		['Bun clients', 'const sqlite = 1'],
		['Bun clients', "'graphql gql sql prisma proto'"],
		['any Bun', 'await Bun.stdin.text()'],
		['createRequire', "import { join } from 'node:path'"],
		['any Bun', 'const Bunny = 1'],
		['require(variable)', "const x = require('./local')"],
		['Worker', 'const worker = 1'],
		['process.binding', 'process.env.X'],
		['browser network', 'const eventSources = 1'],
		['WebSocket', 'const websockets = 1'],
		['globalThis', 'globalThis.name'],
		['Bun[', 'const Bunny = [1]'],
	])('%s leaves alone %p', (label, code) => {
		expect(hit(label, code)).toBe(false);
	});
});
