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
	['Bun clients', /\b(?:S3Client|RedisClient|SQL|sql|redis)\b/],
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

const libraryFiles = (
	readdirSync(import.meta.dir, { recursive: true }) as string[]
)
	.map((name) => name.replaceAll('\\', '/'))
	.filter(
		(name) =>
			/\.[cm]?[jt]sx?$/.test(name) &&
			!/\.(spec|test)\.[cm]?[jt]sx?$/.test(name) &&
			!/\.fixtures\.[cm]?[jt]sx?$/.test(name) &&
			name !== 'runner.ts',
	);

describe('no process or network outside runner.ts', () => {
	test('the check sees the library', () => {
		expect(libraryFiles).toContain('scrub.ts');
		expect(libraryFiles).toContain('fold.ts');
		expect(libraryFiles).not.toContain('runner.ts');
	});

	test.each(libraryFiles)('%s', (name) => {
		const source = stripComments(
			readFileSync(join(import.meta.dir, name), 'utf8'),
		);
		for (const [label, pattern] of FORBIDDEN) {
			expect({ file: name, label, found: pattern.test(source) }).toEqual({
				file: name,
				label,
				found: false,
			});
		}
	});

	test('runner.ts is where they live', () => {
		const source = readFileSync(join(import.meta.dir, 'runner.ts'), 'utf8');
		expect(source).toMatch(/Bun\.spawn/);
		expect(source).toMatch(/fetch\(/);
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
		['browser network', 'const eventSources = 1'],
		['WebSocket', 'const websockets = 1'],
		['globalThis', 'globalThis.name'],
		['Bun[', 'const Bunny = [1]'],
	])('%s leaves alone %p', (label, code) => {
		expect(hit(label, code)).toBe(false);
	});
});
